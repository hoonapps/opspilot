import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { ToolCallStatus } from "../database/entities/types";
import { RequestContext } from "../shared/request-context";
import { AnswerGeneratorService } from "./answer-generator.service";
import { calculateDocumentAgreement, DocumentAgreement } from "./document-agreement";
import { RunbookChecklistService } from "./runbook-checklist.service";
import { PermissionBoundaryAudit, SearchResult, SearchService } from "./search.service";

export type AskResponse = {
  questionId: string;
  answerId: string;
  answer: string;
  confidence: number;
  documentAgreement: DocumentAgreement;
  needsHumanReview: boolean;
  reviewReasons: ReviewReason[];
  sources: Array<{
    documentId: string;
    chunkId: string;
    title: string;
    path: string;
    score: number;
  }>;
  toolCalls: Array<{
    toolName: string;
    status: ToolCallStatus;
  }>;
  permissionAudit: PermissionBoundaryAudit;
};

export type ContextPackage = {
  method: "ranked_context_budget_v1";
  tokenBudget: number;
  estimatedTokenCount: number;
  remainingTokenBudget: number;
  includedChunkCount: number;
  omittedChunkCount: number;
  chunks: Array<{
    rank: number;
    title: string;
    path: string;
    score: number;
    estimatedTokens: number;
    included: boolean;
    reason: "within_budget" | "rank_cutoff" | "budget_exceeded";
  }>;
};

export type RetrievalPreviewResponse = {
  query: string;
  limit: number;
  permissionAudit: PermissionBoundaryAudit;
  candidates: Array<{
    rank: number;
    chunkId: string;
    documentId: string;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    score: number;
    retrieval: SearchResult["retrieval"];
    heading?: string | null;
    contentPreview: string;
  }>;
};

export type ReviewReason =
  | {
      code: "no_sources";
      message: string;
    }
  | {
      code: "low_confidence";
      message: string;
      confidence: number;
      threshold: number;
    }
  | {
      code: "sensitive_action";
      message: string;
      policy: string;
    };

@Injectable()
export class AgentService {
  constructor(
    private readonly orm: MikroORM,
    private readonly searchService: SearchService,
    private readonly authz: AuthzService,
    private readonly answerGenerator: AnswerGeneratorService,
    private readonly runbookChecklist: RunbookChecklistService
  ) {}

  async ask(question: string, context: RequestContext, channel?: string): Promise<AskResponse> {
    const em = this.orm.em.fork();
    const connection = em.getConnection();
    const [questionRow] = await connection.execute<{ id: string }[]>(
      "insert into questions (text, channel, actor) values (?, ?, ?::jsonb) returning id",
      [question, channel ?? null, JSON.stringify(context)]
    );

    const { results: sources, permissionAudit } = await this.searchService.searchWithAudit(question, context, 5);
    await connection.execute(
      `
        insert into tool_call_logs (question_id, tool_name, input, output, status)
        values (?::uuid, 'search_documents', ?::jsonb, ?::jsonb, ?);
      `,
      [
        questionRow.id,
        JSON.stringify({ question, limit: 5, actor: context }),
        JSON.stringify({ sourceCount: sources.length, paths: sources.map((source) => source.path), permissionAudit }),
        ToolCallStatus.Allowed
      ]
    );

    const sensitiveAction = this.authz.isSensitiveAction(question);
    const checklist = this.runbookChecklist.create(question, sources);
    if (checklist) {
      await connection.execute(
        `
          insert into tool_call_logs (question_id, tool_name, input, output, status)
          values (?::uuid, 'create_runbook_checklist', ?::jsonb, ?::jsonb, ?);
        `,
        [
          questionRow.id,
          JSON.stringify({ question, sourcePath: checklist.path }),
          JSON.stringify({ title: checklist.title, itemCount: checklist.items.length, items: checklist.items }),
          ToolCallStatus.Allowed
        ]
      );
    }
    const confidence = calculateConfidence(sources);
    const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3);
    const reviewReasons = buildReviewReasons({
      sourceCount: sources.length,
      confidence,
      confidenceThreshold,
      sensitiveAction
    });
    const needsHumanReview = reviewReasons.length > 0;
    const answer = await this.answerGenerator.generate({ question, sources, needsHumanReview, sensitiveAction, checklist });
    const documentAgreement = calculateDocumentAgreement(
      answer,
      sources.map((source) => source.content)
    );
    const contextPackage = buildContextPackage(sources);

    const [answerRow] = await connection.execute<{ id: string }[]>(
      `
        insert into answers (question_id, text, confidence, needs_human_review, metadata)
        values (?::uuid, ?, ?, ?, ?::jsonb)
        returning id;
      `,
      [
        questionRow.id,
        answer,
        confidence,
        needsHumanReview,
        JSON.stringify({
          sensitiveAction,
          sourceCount: sources.length,
          documentAgreement,
          contextPackage,
          reviewReasons,
          checklist: checklist ? { path: checklist.path, itemCount: checklist.items.length } : null
        })
      ]
    );

    for (const [index, source] of sources.entries()) {
      await connection.execute(
        `
          insert into answer_sources (answer_id, document_id, chunk_id, score, rank)
          values (?::uuid, ?::uuid, ?::uuid, ?, ?);
        `,
        [answerRow.id, source.documentId, source.chunkId, source.score, index + 1]
      );
    }

    if (sensitiveAction) {
      await connection.execute(
        `
          insert into approval_requests (question_id, action, reason, status)
          values (?::uuid, ?, ?::jsonb, 'pending');
        `,
        [
          questionRow.id,
          "sensitive_operation",
          JSON.stringify({ question, policy: "Sensitive operations require human approval." })
        ]
      );
      await connection.execute(
        `
          insert into tool_call_logs (question_id, tool_name, input, output, status)
          values (?::uuid, 'request_human_approval', ?::jsonb, ?::jsonb, ?);
        `,
        [
          questionRow.id,
          JSON.stringify({ action: "sensitive_operation" }),
          JSON.stringify({ approvalStatus: "pending" }),
          ToolCallStatus.NeedsApproval
        ]
      );
    }

    return {
      questionId: questionRow.id,
      answerId: answerRow.id,
      answer,
      confidence,
      documentAgreement,
      needsHumanReview,
      reviewReasons,
      sources: sources.map((source) => ({
        documentId: source.documentId,
        chunkId: source.chunkId,
        title: source.title,
        path: source.path,
        score: source.score
      })),
      toolCalls: [
        { toolName: "search_documents", status: ToolCallStatus.Allowed },
        ...(checklist ? [{ toolName: "create_runbook_checklist", status: ToolCallStatus.Allowed }] : []),
        ...(sensitiveAction ? [{ toolName: "request_human_approval", status: ToolCallStatus.NeedsApproval }] : [])
      ],
      permissionAudit
    };
  }

  async previewRetrieval(question: string, context: RequestContext, limit = 5): Promise<RetrievalPreviewResponse> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const { results, permissionAudit } = await this.searchService.searchWithAudit(question, context, safeLimit);

    return {
      query: question,
      limit: safeLimit,
      permissionAudit,
      candidates: results.map((result, index) => ({
        rank: index + 1,
        chunkId: result.chunkId,
        documentId: result.documentId,
        title: result.title,
        path: result.path,
        visibility: result.visibility,
        teamSlug: result.teamSlug,
        score: Number(result.score.toFixed(6)),
        retrieval: result.retrieval,
        heading: typeof result.metadata.heading === "string" ? result.metadata.heading : null,
        contentPreview: result.content.slice(0, 520)
      }))
    };
  }

}

function buildReviewReasons(input: {
  sourceCount: number;
  confidence: number;
  confidenceThreshold: number;
  sensitiveAction: boolean;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];

  if (input.sourceCount === 0) {
    reasons.push({
      code: "no_sources",
      message: "No permitted source chunks were retrieved for this actor."
    });
  }

  if (input.confidence < input.confidenceThreshold) {
    reasons.push({
      code: "low_confidence",
      message: "Retrieval confidence is below the configured review threshold.",
      confidence: input.confidence,
      threshold: input.confidenceThreshold
    });
  }

  if (input.sensitiveAction) {
    reasons.push({
      code: "sensitive_action",
      message: "The request asks for a production-sensitive operation.",
      policy: "Sensitive operations require human approval before execution."
    });
  }

  return reasons;
}

function calculateConfidence(sources: SearchResult[]): number {
  if (sources.length === 0) {
    return 0;
  }
  const top = normalizeRetrievalScore(sources[0]);
  const second = sources[1] ? normalizeRetrievalScore(sources[1]) : 0;
  return Number(Math.min(0.99, top * 0.8 + Math.max(0, top - second) * 0.2).toFixed(3));
}

function normalizeRetrievalScore(source: SearchResult): number {
  if (source.retrieval.mode === "hybrid") {
    return Math.max(
      Math.min(0.99, source.score * 24),
      source.retrieval.vectorScore ?? 0,
      source.retrieval.lexicalScore ?? 0
    );
  }

  return source.score;
}

function buildContextPackage(sources: SearchResult[]): ContextPackage {
  const tokenBudget = Number(process.env.CONTEXT_TOKEN_BUDGET ?? 1800);
  const maxChunks = Number(process.env.CONTEXT_MAX_CHUNKS ?? 4);
  let usedTokens = 0;
  const chunks = sources.map((source, index) => {
    const estimatedTokens = estimateTokens(`${source.title}\n${source.path}\n${source.content}`);
    const rank = index + 1;
    const rankAllowed = rank <= maxChunks;
    const budgetAllowed = usedTokens + estimatedTokens <= tokenBudget;
    const included = rankAllowed && budgetAllowed;
    if (included) {
      usedTokens += estimatedTokens;
    }

    return {
      rank,
      title: source.title,
      path: source.path,
      score: Number(source.score.toFixed(6)),
      estimatedTokens,
      included,
      reason: included ? ("within_budget" as const) : rankAllowed ? ("budget_exceeded" as const) : ("rank_cutoff" as const)
    };
  });

  return {
    method: "ranked_context_budget_v1",
    tokenBudget,
    estimatedTokenCount: usedTokens,
    remainingTokenBudget: Math.max(0, tokenBudget - usedTokens),
    includedChunkCount: chunks.filter((chunk) => chunk.included).length,
    omittedChunkCount: chunks.filter((chunk) => !chunk.included).length,
    chunks
  };
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
