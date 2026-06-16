import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { ToolCallStatus } from "../database/entities/types";
import { RequestContext } from "../shared/request-context";
import { AnswerGeneratorService } from "./answer-generator.service";
import { SearchResult, SearchService } from "./search.service";

export type AskResponse = {
  answer: string;
  confidence: number;
  needsHumanReview: boolean;
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
};

@Injectable()
export class AgentService {
  constructor(
    private readonly orm: MikroORM,
    private readonly searchService: SearchService,
    private readonly authz: AuthzService,
    private readonly answerGenerator: AnswerGeneratorService
  ) {}

  async ask(question: string, context: RequestContext, channel?: string): Promise<AskResponse> {
    const em = this.orm.em.fork();
    const connection = em.getConnection();
    const [questionRow] = await connection.execute<{ id: string }[]>(
      "insert into questions (text, channel, actor) values (?, ?, ?::jsonb) returning id",
      [question, channel ?? null, JSON.stringify(context)]
    );

    const sources = await this.searchService.search(question, context, 5);
    await connection.execute(
      `
        insert into tool_call_logs (question_id, tool_name, input, output, status)
        values (?::uuid, 'search_documents', ?::jsonb, ?::jsonb, ?);
      `,
      [
        questionRow.id,
        JSON.stringify({ question, limit: 5, actor: context }),
        JSON.stringify({ sourceCount: sources.length, paths: sources.map((source) => source.path) }),
        ToolCallStatus.Allowed
      ]
    );

    const sensitiveAction = this.authz.isSensitiveAction(question);
    const confidence = calculateConfidence(sources);
    const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3);
    const needsHumanReview = sources.length === 0 || confidence < confidenceThreshold || sensitiveAction;
    const answer = await this.answerGenerator.generate({ question, sources, needsHumanReview, sensitiveAction });

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
        JSON.stringify({ sensitiveAction, sourceCount: sources.length })
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
      answer,
      confidence,
      needsHumanReview,
      sources: sources.map((source) => ({
        documentId: source.documentId,
        chunkId: source.chunkId,
        title: source.title,
        path: source.path,
        score: source.score
      })),
      toolCalls: [
        { toolName: "search_documents", status: ToolCallStatus.Allowed },
        ...(sensitiveAction ? [{ toolName: "request_human_approval", status: ToolCallStatus.NeedsApproval }] : [])
      ]
    };
  }

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
