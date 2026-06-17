import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { createHash } from "node:crypto";
import { AuthzService } from "../authz/authz.service";
import { RequestContext } from "../shared/request-context";
import { calculateDocumentAgreement, removeAgreementBoilerplate, tokenizeForAgreement } from "./document-agreement";
import { PermissionBoundaryAudit, SearchResult, SearchService } from "./search.service";

export type AnswerTrace = {
  summary: {
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    needsHumanReview: boolean;
    confidence: number;
    documentAgreementScore: number;
    durationMs: number;
    coveredAnswerTokenCount: number;
    answerTokenCount: number;
    contextEstimatedTokenCount: number;
    contextTokenBudget: number;
  };
  grounding: {
    method: "source_token_overlap_v1";
    answerTokenCount: number;
    coveredAnswerTokenCount: number;
    coverageRatio: number;
    sources: Array<{
      rank: number;
      path: string;
      title: string;
      coverageRatio: number;
      matchedTokenCount: number;
      answerTokenCount: number;
      matchedTokens: string[];
      evidenceSnippets: Array<{
        text: string;
        matchedTokenCount: number;
        matchedTokens: string[];
      }>;
    }>;
  };
  contextPackage: {
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
  timeline: Array<{
    order: number;
    kind: "question" | "retrieval" | "answer" | "tool" | "approval" | "feedback";
    title: string;
    status: string;
    at: string;
    detail: Record<string, unknown>;
  }>;
  answer: {
    id: string;
    questionId: string;
    question: string;
    channel?: string | null;
    actor: Record<string, unknown>;
    text: string;
    confidence: number;
    needsHumanReview: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  sources: Array<{
    rank: number;
    score: number;
    documentId: string;
    chunkId: string;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    chunkIndex: number;
    contentPreview: string;
  }>;
  toolCalls: Array<{
    id: string;
    toolName: string;
    status: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    createdAt: string;
  }>;
  approvals: Array<{
    id: string;
    action: string;
    reason: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
  feedback: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
  }>;
};

export type AnswerProof = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "verified" | "review_required" | "insufficient_evidence";
  score: number;
  thresholds: {
    minDocumentAgreement: number;
    minGroundingCoverage: number;
  };
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  evidence: {
    sourcePaths: string[];
    toolCalls: Array<{ toolName: string; status: string }>;
    approvals: Array<{ action: string; status: string }>;
    feedbackCount: number;
    reviewReasons: string[];
    metrics: {
      confidence: number;
      documentAgreementScore: number;
      groundingCoverageRatio: number;
      contextEstimatedTokenCount: number;
      contextTokenBudget: number;
    };
  };
};

export type AnswerReplay = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "stable" | "needs_review" | "drifted";
  summary: {
    originalTopSourcePath: string | null;
    currentTopSourcePath: string | null;
    topSourceChanged: boolean;
    sourceOverlapRatio: number;
    originalDocumentAgreement: number;
    currentDocumentAgreement: number;
    currentSourceCount: number;
    permissionDeniedCandidates: number;
  };
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  originalSources: Array<{
    rank: number;
    chunkId: string;
    path: string;
    title: string;
    score: number;
  }>;
  currentSources: Array<{
    rank: number;
    chunkId: string;
    path: string;
    title: string;
    score: number;
    retrieval: SearchResult["retrieval"];
  }>;
  permissionAudit: PermissionBoundaryAudit;
};

export type AnswerEvidenceBundle = {
  schemaVersion: "opspilot.answer_evidence_bundle.v1";
  answerId: string;
  questionId: string;
  generatedAt: string;
  actorBoundary: {
    roles: string[];
    teamSlugs: string[];
    sourceAccessRechecked: true;
  };
  summary: {
    proofStatus: AnswerProof["status"];
    proofScore: number;
    replayStatus: AnswerReplay["status"];
    needsHumanReview: boolean;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceOverlapRatio: number;
    permissionDeniedCandidates: number;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
  artifacts: {
    trace: AnswerTrace;
    proof: AnswerProof;
    replay: AnswerReplay;
  };
};

@Injectable()
export class AnswerTraceService {
  constructor(
    private readonly orm: MikroORM,
    private readonly authz: AuthzService,
    private readonly searchService: SearchService
  ) {}

  async getTrace(answerId: string, context: RequestContext): Promise<AnswerTrace> {
    const connection = this.orm.em.fork().getConnection();
    const [answer] = (await connection.execute(
      `
        select
          a.id,
          a.question_id,
          q.text as question,
          q.channel,
          q.actor,
          q.created_at as question_created_at,
          a.text,
          a.confidence,
          a.needs_human_review,
          a.metadata,
          a.created_at
        from answers a
        join questions q on q.id = a.question_id
        where a.id = ?::uuid;
      `,
      [answerId]
    )) as AnswerTraceRow[];

    if (!answer) {
      throw new NotFoundException("Answer trace not found");
    }

    const [sources, toolCalls, approvals, feedback] = await Promise.all([
      connection.execute(
        `
          select
            s.rank,
            s.score,
            d.id as document_id,
            c.id as chunk_id,
            d.title,
            d.path,
            d.visibility,
            d.team_slug,
            c.chunk_index,
            c.content,
            left(c.content, 360) as content_preview
          from answer_sources s
          join documents d on d.id = s.document_id
          join document_chunks c on c.id = s.chunk_id
          where s.answer_id = ?::uuid
          order by s.rank asc;
        `,
        [answerId]
      ) as Promise<SourceTraceRow[]>,
      connection.execute(
        `
          select id, tool_name, status, input, output, created_at
          from tool_call_logs
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [answer.question_id]
      ) as Promise<ToolCallTraceRow[]>,
      connection.execute(
        `
          select id, action, reason, status, created_at
          from approval_requests
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [answer.question_id]
      ) as Promise<ApprovalTraceRow[]>,
      connection.execute(
        `
          select id, rating, comment, created_at
          from feedback
          where answer_id = ?::uuid
          order by created_at asc;
        `,
        [answerId]
      ) as Promise<FeedbackTraceRow[]>
    ]);

    const deniedSources = sources.filter((source) => !this.authz.canAccessDocument(context, source.visibility, source.team_slug));
    if (deniedSources.length > 0) {
      throw new ForbiddenException("Answer trace contains sources that are not accessible to this actor");
    }

    const questionCreatedAt = toIsoString(answer.question_created_at);
    const answerCreatedAt = toIsoString(answer.created_at);
    const mappedToolCalls = toolCalls.map((toolCall) => ({
      id: toolCall.id,
      toolName: toolCall.tool_name,
      status: toolCall.status,
      input: toolCall.input,
      output: toolCall.output,
      createdAt: toIsoString(toolCall.created_at)
    }));
    const mappedApprovals = approvals.map((approval) => ({
      id: approval.id,
      action: approval.action,
      reason: approval.reason,
      status: approval.status,
      createdAt: toIsoString(approval.created_at)
    }));
    const mappedFeedback = feedback.map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      createdAt: toIsoString(item.created_at)
    }));
    const metadata = answer.metadata ?? {};
    const documentAgreement = metadata.documentAgreement as { score?: unknown } | undefined;
    const grounding = buildGrounding(answer.text, sources);
    const contextPackage = readContextPackage(metadata.contextPackage) ?? buildContextPackageFallback(sources);
    const summary = {
      sourceCount: sources.length,
      toolCallCount: mappedToolCalls.length,
      approvalCount: mappedApprovals.length,
      feedbackCount: mappedFeedback.length,
      needsHumanReview: answer.needs_human_review,
      confidence: answer.confidence,
      documentAgreementScore: typeof documentAgreement?.score === "number" ? documentAgreement.score : 0,
      durationMs: calculateDurationMs(questionCreatedAt, [
        answerCreatedAt,
        ...mappedToolCalls.map((event) => event.createdAt),
        ...mappedApprovals.map((event) => event.createdAt),
        ...mappedFeedback.map((event) => event.createdAt)
      ]),
      coveredAnswerTokenCount: grounding.coveredAnswerTokenCount,
      answerTokenCount: grounding.answerTokenCount,
      contextEstimatedTokenCount: contextPackage.estimatedTokenCount,
      contextTokenBudget: contextPackage.tokenBudget
    };

    return {
      summary,
      grounding,
      contextPackage,
      timeline: buildTimeline({
        answerId: answer.id,
        questionId: answer.question_id,
        question: answer.question,
        questionCreatedAt,
        answerCreatedAt,
        summary,
        sources,
        toolCalls: mappedToolCalls,
        approvals: mappedApprovals,
        feedback: mappedFeedback
      }),
      answer: {
        id: answer.id,
        questionId: answer.question_id,
        question: answer.question,
        channel: answer.channel,
        actor: answer.actor,
        text: answer.text,
        confidence: answer.confidence,
        needsHumanReview: answer.needs_human_review,
        metadata,
        createdAt: answerCreatedAt
      },
      sources: sources.map((source) => ({
        rank: source.rank,
        score: source.score,
        documentId: source.document_id,
        chunkId: source.chunk_id,
        title: source.title,
        path: source.path,
        visibility: source.visibility,
        teamSlug: source.team_slug,
        chunkIndex: source.chunk_index,
        contentPreview: source.content_preview
      })),
      toolCalls: mappedToolCalls,
      approvals: mappedApprovals,
      feedback: mappedFeedback
    };
  }

  async getProof(answerId: string, context: RequestContext): Promise<AnswerProof> {
    const trace = await this.getTrace(answerId, context);
    const thresholds = {
      minDocumentAgreement: readProofThreshold(
        "PROOF_MIN_DOCUMENT_AGREEMENT",
        Number(process.env.EVAL_MIN_DOCUMENT_AGREEMENT_SCORE ?? 0.8)
      ),
      minGroundingCoverage: readProofThreshold("PROOF_MIN_GROUNDING_COVERAGE", 0.2)
    };
    const reviewReasons = readReviewReasonCodes(trace.answer.metadata.reviewReasons);
    const checks = buildProofChecks(trace, thresholds);
    const passCount = checks.filter((check) => check.status === "pass").length;

    return {
      answerId: trace.answer.id,
      questionId: trace.answer.questionId,
      generatedAt: new Date().toISOString(),
      status: proofStatus(checks),
      score: ratio(passCount, checks.length),
      thresholds,
      checks,
      evidence: {
        sourcePaths: trace.sources.map((source) => source.path),
        toolCalls: trace.toolCalls.map((toolCall) => ({ toolName: toolCall.toolName, status: toolCall.status })),
        approvals: trace.approvals.map((approval) => ({ action: approval.action, status: approval.status })),
        feedbackCount: trace.feedback.length,
        reviewReasons,
        metrics: {
          confidence: trace.summary.confidence,
          documentAgreementScore: trace.summary.documentAgreementScore,
          groundingCoverageRatio: trace.grounding.coverageRatio,
          contextEstimatedTokenCount: trace.contextPackage.estimatedTokenCount,
          contextTokenBudget: trace.contextPackage.tokenBudget
        }
      }
    };
  }

  async replay(answerId: string, context: RequestContext): Promise<AnswerReplay> {
    const trace = await this.getTrace(answerId, context);
    const { results, permissionAudit } = await this.searchService.searchWithAudit(trace.answer.question, context, 5);
    const originalChunkIds = new Set(trace.sources.map((source) => source.chunkId));
    const currentChunkIds = new Set(results.map((source) => source.chunkId));
    const overlappingChunkCount = [...originalChunkIds].filter((chunkId) => currentChunkIds.has(chunkId)).length;
    const originalTopSourcePath = trace.sources[0]?.path ?? null;
    const currentTopSourcePath = results[0]?.path ?? null;
    const currentDocumentAgreement = calculateDocumentAgreement(
      trace.answer.text,
      results.map((source) => source.content)
    ).score;
    const originalDocumentAgreement =
      typeof (trace.answer.metadata.documentAgreement as { score?: unknown } | undefined)?.score === "number"
        ? ((trace.answer.metadata.documentAgreement as { score: number }).score)
        : trace.summary.documentAgreementScore;
    const summary = {
      originalTopSourcePath,
      currentTopSourcePath,
      topSourceChanged: originalTopSourcePath !== currentTopSourcePath,
      sourceOverlapRatio: ratio(overlappingChunkCount, Math.max(originalChunkIds.size, 1)),
      originalDocumentAgreement,
      currentDocumentAgreement,
      currentSourceCount: results.length,
      permissionDeniedCandidates: permissionAudit.deniedCandidateCount
    };
    const checks = buildReplayChecks(summary);

    return {
      answerId: trace.answer.id,
      questionId: trace.answer.questionId,
      generatedAt: new Date().toISOString(),
      status: replayStatus(checks),
      summary,
      checks,
      originalSources: trace.sources.map((source) => ({
        rank: source.rank,
        chunkId: source.chunkId,
        path: source.path,
        title: source.title,
        score: source.score
      })),
      currentSources: results.map((source, index) => ({
        rank: index + 1,
        chunkId: source.chunkId,
        path: source.path,
        title: source.title,
        score: Number(source.score.toFixed(6)),
        retrieval: source.retrieval
      })),
      permissionAudit
    };
  }

  async getEvidenceBundle(answerId: string, context: RequestContext): Promise<AnswerEvidenceBundle> {
    const trace = await this.getTrace(answerId, context);
    const [proof, replay] = await Promise.all([this.getProof(answerId, context), this.replay(answerId, context)]);
    const unsigned = {
      schemaVersion: "opspilot.answer_evidence_bundle.v1" as const,
      answerId: trace.answer.id,
      questionId: trace.answer.questionId,
      generatedAt: new Date().toISOString(),
      actorBoundary: {
        roles: context.roles.slice().sort(),
        teamSlugs: context.teamSlugs.slice().sort(),
        sourceAccessRechecked: true as const
      },
      summary: {
        proofStatus: proof.status,
        proofScore: proof.score,
        replayStatus: replay.status,
        needsHumanReview: trace.summary.needsHumanReview,
        sourceCount: trace.summary.sourceCount,
        toolCallCount: trace.summary.toolCallCount,
        approvalCount: trace.summary.approvalCount,
        feedbackCount: trace.summary.feedbackCount,
        documentAgreementScore: trace.summary.documentAgreementScore,
        groundingCoverageRatio: trace.grounding.coverageRatio,
        sourceOverlapRatio: replay.summary.sourceOverlapRatio,
        permissionDeniedCandidates: replay.summary.permissionDeniedCandidates
      },
      artifacts: {
        trace,
        proof,
        replay
      }
    };

    return {
      ...unsigned,
      integrity: {
        algorithm: "sha256",
        canonicalization: "stable_json_v1",
        hash: sha256StableJson(unsigned)
      }
    };
  }
}

type AnswerTraceRow = {
  id: string;
  question_id: string;
  question: string;
  channel?: string | null;
  actor: Record<string, unknown>;
  question_created_at: Date | string;
  text: string;
  confidence: number;
  needs_human_review: boolean;
  metadata: Record<string, unknown>;
  created_at: Date | string;
};

type SourceTraceRow = {
  rank: number;
  score: number;
  document_id: string;
  chunk_id: string;
  title: string;
  path: string;
  visibility: string;
  team_slug?: string | null;
  chunk_index: number;
  content: string;
  content_preview: string;
};

type ToolCallTraceRow = {
  id: string;
  tool_name: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  created_at: Date | string;
};

type ApprovalTraceRow = {
  id: string;
  action: string;
  reason: Record<string, unknown>;
  status: string;
  created_at: Date | string;
};

type FeedbackTraceRow = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function calculateDurationMs(start: string, eventTimes: string[]): number {
  const startMs = new Date(start).getTime();
  const endMs = Math.max(startMs, ...eventTimes.map((value) => new Date(value).getTime()));
  return Math.max(0, endMs - startMs);
}

function buildGrounding(answerText: string, sources: SourceTraceRow[]): AnswerTrace["grounding"] {
  const answerTokens = [...new Set(tokenizeForAgreement(removeAgreementBoilerplate(answerText)))];
  const sourceMatches = sources.map((source) => {
    const sourceTokens = new Set(tokenizeForAgreement(source.content));
    const matchedTokens = answerTokens.filter((token) => sourceTokens.has(token));
    const evidenceSnippets = extractEvidenceSnippets(source.content, answerTokens);
    return {
      matchedTokens,
      evidenceSnippets,
      rank: source.rank,
      path: source.path,
      title: source.title,
      coverageRatio: ratio(matchedTokens.length, answerTokens.length),
      matchedTokenCount: matchedTokens.length,
      answerTokenCount: answerTokens.length
    };
  });
  const coveredTokens = new Set(sourceMatches.flatMap((source) => source.matchedTokens));

  return {
    method: "source_token_overlap_v1",
    answerTokenCount: answerTokens.length,
    coveredAnswerTokenCount: coveredTokens.size,
    coverageRatio: ratio(coveredTokens.size, answerTokens.length),
    sources: sourceMatches.map((source) => ({
      rank: source.rank,
      path: source.path,
      title: source.title,
      coverageRatio: source.coverageRatio,
      matchedTokenCount: source.matchedTokenCount,
      answerTokenCount: source.answerTokenCount,
      matchedTokens: source.matchedTokens.slice(0, 12),
      evidenceSnippets: source.evidenceSnippets
    }))
  };
}

function extractEvidenceSnippets(
  content: string,
  answerTokens: string[]
): AnswerTrace["grounding"]["sources"][number]["evidenceSnippets"] {
  const answerTokenSet = new Set(answerTokens);
  return splitEvidenceUnits(content)
    .map((text) => {
      const tokens = [...new Set(tokenizeForAgreement(text))].filter((token) => answerTokenSet.has(token));
      return {
        text: compactEvidenceText(text),
        matchedTokenCount: tokens.length,
        matchedTokens: tokens.slice(0, 8)
      };
    })
    .filter((snippet) => snippet.matchedTokenCount > 0)
    .sort((a, b) => b.matchedTokenCount - a.matchedTokenCount || b.text.length - a.text.length)
    .slice(0, 2);
}

function splitEvidenceUnits(content: string): string[] {
  return content
    .split(/\n+|(?<=[.!?。])\s+/u)
    .map((line) => line.replace(/^#+\s*/u, "").replace(/^[-*]\s*/u, "").trim())
    .filter((line) => line.length >= 12);
}

function compactEvidenceText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(3));
}

function buildProofChecks(
  trace: AnswerTrace,
  thresholds: AnswerProof["thresholds"]
): AnswerProof["checks"] {
  const searchTool = trace.toolCalls.find((toolCall) => toolCall.toolName === "search_documents");
  const approvalTool = trace.toolCalls.find((toolCall) => toolCall.toolName === "request_human_approval");
  const reviewReasons = readReviewReasonCodes(trace.answer.metadata.reviewReasons);
  const needsSensitiveApproval = trace.summary.needsHumanReview || reviewReasons.includes("sensitive_action");
  const contextWithinBudget = trace.contextPackage.estimatedTokenCount <= trace.contextPackage.tokenBudget;
  const evidenceSnippetCount = trace.grounding.sources.reduce((total, source) => total + source.evidenceSnippets.length, 0);

  return [
    {
      id: "source_access_rechecked",
      label: "Source access rechecked",
      status: "pass",
      evidence: `Trace read rechecked ${trace.sources.length} returned sources against the caller context.`
    },
    {
      id: "sources_attached",
      label: "Sources attached",
      status: trace.sources.length > 0 ? "pass" : "fail",
      evidence:
        trace.sources.length > 0
          ? `${trace.sources.length} sources persisted with the answer.`
          : "No persisted sources were attached to this answer."
    },
    {
      id: "document_agreement",
      label: "Document agreement",
      status: thresholdStatus(trace.summary.documentAgreementScore, thresholds.minDocumentAgreement),
      evidence: `Answer/source token agreement is ${formatRatio(trace.summary.documentAgreementScore)}.`,
      metric: trace.summary.documentAgreementScore,
      threshold: thresholds.minDocumentAgreement
    },
    {
      id: "grounding_coverage",
      label: "Grounding coverage",
      status: thresholdStatus(trace.grounding.coverageRatio, thresholds.minGroundingCoverage),
      evidence: `${trace.grounding.coveredAnswerTokenCount}/${trace.grounding.answerTokenCount} answer tokens overlap retrieved sources.`,
      metric: trace.grounding.coverageRatio,
      threshold: thresholds.minGroundingCoverage
    },
    {
      id: "evidence_snippets",
      label: "Evidence snippets",
      status: evidenceSnippetCount > 0 ? "pass" : "fail",
      evidence:
        evidenceSnippetCount > 0
          ? `${evidenceSnippetCount} source snippets explain which document sentences support the answer.`
          : "No supporting source snippets were extracted for this answer."
    },
    {
      id: "search_tool_audited",
      label: "Search tool audited",
      status: searchTool?.status === "allowed" ? "pass" : "fail",
      evidence: searchTool
        ? `search_documents was persisted with status ${searchTool.status}.`
        : "search_documents was not found in persisted tool call logs."
    },
    {
      id: "approval_boundary",
      label: "Approval boundary",
      status: needsSensitiveApproval
        ? approvalTool && trace.approvals.length > 0
          ? "pass"
          : "fail"
        : "pass",
      evidence: needsSensitiveApproval
        ? approvalTool && trace.approvals.length > 0
          ? `Sensitive answer created ${trace.approvals.length} approval request and ${approvalTool.toolName} stayed ${approvalTool.status}.`
          : "Sensitive answer did not persist the expected approval handoff."
        : "No sensitive approval handoff was required for this answer."
    },
    {
      id: "context_budget",
      label: "Context budget",
      status: contextWithinBudget && trace.contextPackage.includedChunkCount > 0 ? "pass" : "fail",
      evidence: `${trace.contextPackage.estimatedTokenCount}/${trace.contextPackage.tokenBudget} estimated context tokens used.`
    },
    {
      id: "feedback_captured",
      label: "Feedback captured",
      status: trace.feedback.length > 0 ? "pass" : "warn",
      evidence:
        trace.feedback.length > 0
          ? `${trace.feedback.length} feedback records are linked to the answer.`
          : "No reviewer feedback has been linked yet."
    }
  ];
}

function thresholdStatus(metric: number, threshold: number): AnswerProof["checks"][number]["status"] {
  if (metric >= threshold) {
    return "pass";
  }
  return metric >= threshold * 0.8 ? "warn" : "fail";
}

function proofStatus(checks: AnswerProof["checks"]): AnswerProof["status"] {
  if (checks.some((check) => check.status === "fail")) {
    return "insufficient_evidence";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "review_required";
  }
  return "verified";
}

function buildReplayChecks(summary: AnswerReplay["summary"]): AnswerReplay["checks"] {
  const minOverlap = readProofThreshold("REPLAY_MIN_SOURCE_OVERLAP", 0.6);
  const minCurrentAgreement = readProofThreshold(
    "REPLAY_MIN_CURRENT_DOCUMENT_AGREEMENT",
    Number(process.env.EVAL_MIN_DOCUMENT_AGREEMENT_SCORE ?? 0.8)
  );

  return [
    {
      id: "top_source_stable",
      label: "Top source stable",
      status: summary.topSourceChanged ? "fail" : "pass",
      evidence: summary.topSourceChanged
        ? `Top source changed from ${summary.originalTopSourcePath ?? "none"} to ${summary.currentTopSourcePath ?? "none"}.`
        : `Top source remains ${summary.currentTopSourcePath ?? "none"}.`
    },
    {
      id: "source_overlap",
      label: "Source overlap",
      status: thresholdStatus(summary.sourceOverlapRatio, minOverlap),
      evidence: `Current retrieval overlaps ${formatRatio(summary.sourceOverlapRatio)} of the original answer sources.`,
      metric: summary.sourceOverlapRatio,
      threshold: minOverlap
    },
    {
      id: "current_document_agreement",
      label: "Current document agreement",
      status: thresholdStatus(summary.currentDocumentAgreement, minCurrentAgreement),
      evidence: `Original answer/current source agreement is ${formatRatio(summary.currentDocumentAgreement)}.`,
      metric: summary.currentDocumentAgreement,
      threshold: minCurrentAgreement
    },
    {
      id: "permission_boundary_replayed",
      label: "Permission boundary replayed",
      status: "pass",
      evidence: `Replay used permission-aware retrieval and denied ${summary.permissionDeniedCandidates} inaccessible candidates.`
    }
  ];
}

function replayStatus(checks: AnswerReplay["checks"]): AnswerReplay["status"] {
  if (checks.some((check) => check.status === "fail")) {
    return "drifted";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "needs_review";
  }
  return "stable";
}

function sha256StableJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "\"__undefined__\"";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function readProofThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return value;
}

function readReviewReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { code?: unknown }).code !== "string") {
      return [];
    }
    return [(item as { code: string }).code];
  });
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function readContextPackage(value: unknown): AnswerTrace["contextPackage"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<AnswerTrace["contextPackage"]>;
  if (
    candidate.method !== "ranked_context_budget_v1" ||
    typeof candidate.tokenBudget !== "number" ||
    typeof candidate.estimatedTokenCount !== "number" ||
    typeof candidate.remainingTokenBudget !== "number" ||
    typeof candidate.includedChunkCount !== "number" ||
    typeof candidate.omittedChunkCount !== "number" ||
    !Array.isArray(candidate.chunks)
  ) {
    return null;
  }

  return candidate as AnswerTrace["contextPackage"];
}

function buildContextPackageFallback(sources: SourceTraceRow[]): AnswerTrace["contextPackage"] {
  const tokenBudget = Number(process.env.CONTEXT_TOKEN_BUDGET ?? 1800);
  const maxChunks = Number(process.env.CONTEXT_MAX_CHUNKS ?? 4);
  let usedTokens = 0;
  const chunks = sources.map((source) => {
    const estimatedTokens = estimateTokens(`${source.title}\n${source.path}\n${source.content}`);
    const rankAllowed = source.rank <= maxChunks;
    const budgetAllowed = usedTokens + estimatedTokens <= tokenBudget;
    const included = rankAllowed && budgetAllowed;
    if (included) {
      usedTokens += estimatedTokens;
    }

    return {
      rank: source.rank,
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

function buildTimeline(input: {
  answerId: string;
  questionId: string;
  question: string;
  questionCreatedAt: string;
  answerCreatedAt: string;
  summary: AnswerTrace["summary"];
  sources: SourceTraceRow[];
  toolCalls: AnswerTrace["toolCalls"];
  approvals: AnswerTrace["approvals"];
  feedback: AnswerTrace["feedback"];
}): AnswerTrace["timeline"] {
  const events: AnswerTrace["timeline"] = [
    {
      order: 1,
      kind: "question",
      title: "Question persisted",
      status: "created",
      at: input.questionCreatedAt,
      detail: {
        questionId: input.questionId,
        question: input.question
      }
    },
    {
      order: 2,
      kind: "retrieval",
      title: "Sources attached",
      status: input.sources.length > 0 ? "grounded" : "empty",
      at: input.answerCreatedAt,
      detail: {
        sourceCount: input.sources.length,
        topSource: input.sources[0]?.path ?? null,
        topScore: input.sources[0]?.score ?? null
      }
    },
    {
      order: 3,
      kind: "answer",
      title: "Answer generated",
      status: input.summary.needsHumanReview ? "needs_review" : "auto",
      at: input.answerCreatedAt,
      detail: {
        answerId: input.answerId,
        confidence: input.summary.confidence,
        documentAgreementScore: input.summary.documentAgreementScore,
        durationMs: input.summary.durationMs
      }
    },
    ...input.toolCalls.map((toolCall, index) => ({
      order: 10 + index,
      kind: "tool" as const,
      title: toolCall.toolName,
      status: toolCall.status,
      at: toolCall.createdAt,
      detail: {
        input: toolCall.input,
        output: toolCall.output
      }
    })),
    ...input.approvals.map((approval, index) => ({
      order: 100 + index,
      kind: "approval" as const,
      title: approval.action,
      status: approval.status,
      at: approval.createdAt,
      detail: {
        reason: approval.reason
      }
    })),
    ...input.feedback.map((item, index) => ({
      order: 200 + index,
      kind: "feedback" as const,
      title: "Feedback saved",
      status: item.rating > 0 ? "helpful" : "needs_work",
      at: item.createdAt,
      detail: {
        rating: item.rating,
        comment: item.comment ?? null
      }
    }))
  ];

  return events.sort((a, b) => {
    const timeDiff = new Date(a.at).getTime() - new Date(b.at).getTime();
    return timeDiff === 0 ? a.order - b.order : timeDiff;
  });
}
