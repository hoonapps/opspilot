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
  diagnostics: RetrievalDiagnostics;
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

export type RetrievalDiagnostics = {
  status: "ready" | "review" | "blocked";
  recommendedAction: "answer" | "answer_with_context_review" | "human_review" | "clarify_or_expand_sources";
  confidenceEstimate: number;
  topScore: number;
  scoreGap: number;
  queryTerms: string[];
  queryPlan: RetrievalQueryPlan;
  sourceDiversity: {
    uniqueDocumentCount: number;
    uniquePathCount: number;
    duplicatePathCount: number;
  };
  contextPackage: ContextPackage;
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    metric?: number;
    threshold?: number;
    message: string;
  }>;
};

export type RetrievalQueryPlan = {
  mode: "vector" | "hybrid";
  scoreFormula: string;
  candidateWindow: number;
  thresholds: {
    confidence: number;
    topScore: number;
    contextTokenBudget: number;
    maxContextChunks: number;
  };
  stages: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    input: string;
    output: string;
    evidence: string;
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
      diagnostics: buildRetrievalDiagnostics(question, results, permissionAudit),
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

function normalizeRetrievalScore(source: SearchResult | undefined): number {
  if (!source) {
    return 0;
  }
  if (source.retrieval.mode === "hybrid") {
    return Math.max(
      Math.min(0.99, source.score * 24),
      source.retrieval.vectorScore ?? 0,
      source.retrieval.lexicalScore ?? 0
    );
  }

  return source.score;
}

function buildRetrievalDiagnostics(
  question: string,
  sources: SearchResult[],
  permissionAudit: PermissionBoundaryAudit
): RetrievalDiagnostics {
  const confidenceEstimate = calculateConfidence(sources);
  const topScore = normalizeRetrievalScore(sources[0]);
  const secondScore = normalizeRetrievalScore(sources[1]);
  const scoreGap = Number(Math.max(0, topScore - secondScore).toFixed(3));
  const contextPackage = buildContextPackage(sources);
  const uniquePathCount = new Set(sources.map((source) => source.path)).size;
  const uniqueDocumentCount = new Set(sources.map((source) => source.documentId)).size;
  const duplicatePathCount = Math.max(0, sources.length - uniquePathCount);
  const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3);
  const topScoreThreshold = Number(process.env.RETRIEVAL_PREVIEW_TOP_SCORE_THRESHOLD ?? 0.25);
  const diversityThreshold = Math.min(2, sources.length);

  const checks: RetrievalDiagnostics["checks"] = [
    {
      id: "candidate_presence",
      label: "허용 후보",
      status: sources.length > 0 ? "pass" : "fail",
      metric: sources.length,
      threshold: 1,
      message:
        sources.length > 0
          ? `${sources.length}개 허용 후보가 답변 컨텍스트 후보로 검색됐습니다.`
          : "권한을 통과한 검색 후보가 없어 답변을 생성하면 근거 부족 상태가 됩니다."
    },
    {
      id: "confidence_estimate",
      label: "신뢰도 추정",
      status: thresholdStatus(confidenceEstimate, confidenceThreshold),
      metric: confidenceEstimate,
      threshold: confidenceThreshold,
      message:
        confidenceEstimate >= confidenceThreshold
          ? "상위 후보 점수와 점수 격차가 최소 신뢰도 기준을 넘었습니다."
          : "상위 후보 점수나 점수 격차가 낮아 담당자 확인 또는 질문 보강이 필요합니다."
    },
    {
      id: "top_score",
      label: "최고 점수",
      status: thresholdStatus(topScore, topScoreThreshold),
      metric: topScore,
      threshold: topScoreThreshold,
      message:
        topScore >= topScoreThreshold
          ? "최상위 후보가 답변 근거로 사용할 수 있는 최소 검색 점수를 넘었습니다."
          : "최상위 후보 점수가 낮습니다. 키워드, 문서 제목, 팀 권한을 확인해야 합니다."
    },
    {
      id: "source_diversity",
      label: "출처 다양성",
      status: uniquePathCount >= diversityThreshold ? "pass" : sources.length > 0 ? "warn" : "fail",
      metric: uniquePathCount,
      threshold: diversityThreshold,
      message:
        uniquePathCount >= diversityThreshold
          ? `${uniquePathCount}개 문서 경로에서 근거가 분산되어 단일 청크 과의존이 낮습니다.`
          : "후보가 같은 문서에 몰려 있습니다. 장애/정책 답변은 관련 런북이나 정책 문서가 함께 검색되는지 확인해야 합니다."
    },
    {
      id: "context_budget",
      label: "컨텍스트 예산",
      status: contextPackage.omittedChunkCount === 0 ? "pass" : "warn",
      metric: contextPackage.includedChunkCount,
      threshold: Math.min(sources.length, Number(process.env.CONTEXT_MAX_CHUNKS ?? 4)),
      message:
        contextPackage.omittedChunkCount === 0
          ? "검색 후보가 현재 컨텍스트 예산 안에 모두 들어갑니다."
          : `${contextPackage.omittedChunkCount}개 후보가 rank 또는 token 예산 때문에 답변 컨텍스트에서 제외됩니다.`
    },
    {
      id: "permission_boundary",
      label: "권한 경계",
      status: permissionAudit.deniedCandidateCount > 0 ? "warn" : "pass",
      metric: permissionAudit.deniedCandidateCount,
      threshold: 0,
      message:
        permissionAudit.deniedCandidateCount > 0
          ? `${permissionAudit.deniedCandidateCount}개 후보가 권한 경계에서 차단됐습니다. 답변에는 허용된 출처만 사용됩니다.`
          : "검색 후보가 권한 경계에서 추가 차단 없이 통과했습니다."
    }
  ];

  const failed = checks.some((check) => check.status === "fail");
  const warned = checks.some((check) => check.status === "warn");
  const status = failed ? "blocked" : warned ? "review" : "ready";
  const humanReviewWarningIds = new Set(["confidence_estimate", "top_score", "permission_boundary"]);
  const hasHumanReviewWarning = checks.some((check) => check.status === "warn" && humanReviewWarningIds.has(check.id));
  const recommendedAction: RetrievalDiagnostics["recommendedAction"] =
    status === "ready"
      ? "answer"
      : failed
        ? "clarify_or_expand_sources"
        : hasHumanReviewWarning
          ? "human_review"
          : "answer_with_context_review";

  return {
    status,
    recommendedAction,
    confidenceEstimate,
    topScore,
    scoreGap,
    queryTerms: extractQueryTerms(question),
    queryPlan: buildRetrievalQueryPlan({
      question,
      sources,
      permissionAudit,
      contextPackage,
      checks,
      confidenceThreshold,
      topScoreThreshold
    }),
    sourceDiversity: {
      uniqueDocumentCount,
      uniquePathCount,
      duplicatePathCount
    },
    contextPackage,
    checks
  };
}

function buildRetrievalQueryPlan(input: {
  question: string;
  sources: SearchResult[];
  permissionAudit: PermissionBoundaryAudit;
  contextPackage: ContextPackage;
  checks: RetrievalDiagnostics["checks"];
  confidenceThreshold: number;
  topScoreThreshold: number;
}): RetrievalQueryPlan {
  const mode: RetrievalQueryPlan["mode"] = input.sources.some((source) => source.retrieval.mode === "hybrid") ? "hybrid" : "vector";
  const statusById = new Map(input.checks.map((check) => [check.id, check.status]));
  const queryTerms = extractQueryTerms(input.question);
  const includedPaths = input.contextPackage.chunks.filter((chunk) => chunk.included).map((chunk) => chunk.path);

  return {
    mode,
    scoreFormula:
      mode === "hybrid"
        ? "reciprocal_rank_fusion(k=60) over pgvector and Elasticsearch, then PostgreSQL permission recheck"
        : "score = vector_score * 0.45 + lexical_score * 0.55",
    candidateWindow: input.permissionAudit.candidateWindow,
    thresholds: {
      confidence: input.confidenceThreshold,
      topScore: input.topScoreThreshold,
      contextTokenBudget: input.contextPackage.tokenBudget,
      maxContextChunks: Number(process.env.CONTEXT_MAX_CHUNKS ?? 4)
    },
    stages: [
      {
        id: "normalize_query",
        label: "질문 정규화",
        status: queryTerms.length > 0 ? "pass" : "warn",
        input: "사용자 질문",
        output: queryTerms.length > 0 ? queryTerms.join(", ") : "검색어 없음",
        evidence: `${queryTerms.length}개 검색어를 추출해 벡터/키워드 검색에 사용합니다.`
      },
      {
        id: "candidate_generation",
        label: "후보 생성",
        status: statusById.get("candidate_presence") ?? "fail",
        input: mode === "hybrid" ? "pgvector + Elasticsearch" : "PostgreSQL pgvector",
        output: `허용 후보 ${input.sources.length}개`,
        evidence: `상위 후보 점수 ${normalizeRetrievalScore(input.sources[0]).toFixed(3)} / 후보 창 ${input.permissionAudit.candidateWindow}개`
      },
      {
        id: "permission_boundary",
        label: "권한 경계",
        status: statusById.get("permission_boundary") ?? "pass",
        input: `${input.permissionAudit.actor.roles.join("|") || "역할 없음"} / ${input.permissionAudit.actor.teamSlugs.join("|") || "팀 없음"}`,
        output: `허용 ${input.permissionAudit.allowedCandidateCount}개, 차단 ${input.permissionAudit.deniedCandidateCount}개`,
        evidence: formatDeniedByVisibility(input.permissionAudit.deniedByVisibility)
      },
      {
        id: "score_fusion",
        label: "점수 결합",
        status: statusById.get("top_score") ?? "warn",
        input: mode === "hybrid" ? "벡터 순위와 키워드 순위" : "벡터 점수와 키워드 점수",
        output: input.sources[0] ? `${input.sources[0].path} (${input.sources[0].score.toFixed(3)})` : "상위 후보 없음",
        evidence: mode === "hybrid" ? "RRF 점수로 정렬 후 PostgreSQL에서 청크를 다시 로드합니다." : "가중 합산 점수로 후보를 정렬합니다."
      },
      {
        id: "context_packaging",
        label: "컨텍스트 패키징",
        status: statusById.get("context_budget") ?? "pass",
        input: `${input.sources.length}개 검색 후보`,
        output: `포함 ${input.contextPackage.includedChunkCount}개 / ${input.contextPackage.estimatedTokenCount}토큰`,
        evidence: includedPaths.length > 0 ? includedPaths.join(", ") : "포함된 청크 없음"
      },
      {
        id: "review_decision",
        label: "리뷰 판단",
        status: statusById.get("confidence_estimate") ?? "warn",
        input: `신뢰도 기준 ${input.confidenceThreshold}, 최고 점수 기준 ${input.topScoreThreshold}`,
        output: input.checks.some((check) => check.status === "fail")
          ? "근거 보강 필요"
          : input.checks.some((check) => check.status === "warn")
            ? "담당자 검토 권고"
            : "자동 답변 가능",
        evidence: input.checks
          .filter((check) => check.status !== "pass")
          .map((check) => check.label)
          .join(", ") || "모든 검색 품질 체크 통과"
      }
    ]
  };
}

function formatDeniedByVisibility(deniedByVisibility: Record<string, number>): string {
  const entries = Object.entries(deniedByVisibility);
  if (entries.length === 0) {
    return "차단된 후보 없음";
  }
  return entries.map(([visibility, count]) => `${visibility}:${count}`).join(", ");
}

function thresholdStatus(value: number, threshold: number): "pass" | "warn" | "fail" {
  if (value >= threshold) {
    return "pass";
  }
  return value > 0 ? "warn" : "fail";
}

function extractQueryTerms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
  ).slice(0, 12);
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
