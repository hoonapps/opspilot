import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { createChatProviderFromEnv, createEmbeddingProviderFromEnv, ToolDefinition } from "@opspilot/ai";
import { AuthzService } from "../authz/authz.service";
import { ToolCallStatus } from "../database/entities/types";
import { sha256 } from "../shared/hash";
import { RequestContext } from "../shared/request-context";
import { AnswerGeneratorService } from "./answer-generator.service";
import { calculateDocumentAgreement, calculateSemanticDocumentAgreement, DocumentAgreement } from "./document-agreement";
import { RunbookChecklist, RunbookChecklistService } from "./runbook-checklist.service";
import { PermissionBoundaryAudit, RerankMethod, SearchResult, SearchService } from "./search.service";

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
    rankingExplanation: RankingExplanation;
    heading?: string | null;
    contentPreview: string;
  }>;
};

export type RetrievalProfileReport = {
  schemaVersion: "opspilot.retrieval_profile.v1";
  generatedAt: string;
  query: string;
  limit: number;
  status: "optimized" | "watch" | "risk";
  profileHash: string;
  summary: {
    endToEndMs: number;
    searchMs: number;
    diagnosticsMs: number;
    candidatePackagingMs: number;
    allowedCandidateCount: number;
    deniedCandidateCount: number;
    candidateWindow: number;
    confidenceEstimate: number;
    topScore: number;
    scoreGap: number;
    contextTokenUseRatio: number;
    mode: RetrievalQueryPlan["mode"];
    latencyBudgetMs: number;
    latencyBudgetStatus: "pass" | "warn" | "fail";
  };
  stages: Array<{
    id: "normalize_query" | "search_with_audit" | "diagnostics" | "candidate_packaging" | "release_decision";
    label: string;
    status: "pass" | "warn" | "fail";
    durationMs: number;
    budgetMs: number;
    input: string;
    output: string;
    evidence: string;
  }>;
  bottlenecks: Array<{
    id: string;
    label: string;
    severity: "info" | "warn" | "critical";
    message: string;
    action: string;
  }>;
  preview: RetrievalPreviewResponse;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
    includedFields: string[];
  };
};

export type RetrievalRobustnessReport = {
  schemaVersion: "opspilot.retrieval_robustness.v1";
  generatedAt: string;
  baselineQuestion: string;
  status: "stable" | "review" | "unstable";
  recommendedAction: "answer" | "review_top_sources" | "rewrite_query_or_add_docs";
  summary: {
    variantCount: number;
    topSourceStability: number;
    averageSourceOverlap: number;
    averageConfidenceEstimate: number;
    maxScoreDelta: number;
    permissionDeniedTotal: number;
  };
  checks: Array<{
    id: "top_source_stability" | "source_overlap" | "confidence_floor" | "score_drift" | "permission_boundary";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  baseline: RetrievalRobustnessRun;
  variants: RetrievalRobustnessRun[];
};

export type RetrievalRobustnessRun = {
  query: string;
  rank: number;
  diagnosticsStatus: RetrievalDiagnostics["status"];
  recommendedAction: RetrievalDiagnostics["recommendedAction"];
  confidenceEstimate: number;
  topScore: number;
  topSourcePath: string | null;
  topSourceTitle: string | null;
  sourcePaths: string[];
  sourceOverlapWithBaseline: number;
  topSourceMatchesBaseline: boolean;
  permissionDeniedCount: number;
  queryTerms: string[];
};

export type RetrievalPermissionDiffReport = {
  schemaVersion: "opspilot.retrieval_permission_diff.v1";
  generatedAt: string;
  query: string;
  status: "isolated" | "review";
  summary: {
    personaCount: number;
    uniqueTopSourceCount: number;
    maxDeniedCandidateCount: number;
    unprivilegedRestrictedCandidateCount: number;
    privilegedRestrictedCandidateCount: number;
    topSourceChangedCount: number;
  };
  checks: Array<{
    id: "restricted_isolation" | "team_scope" | "privileged_visibility" | "top_source_diff" | "candidate_window";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  personas: RetrievalPermissionPersonaRun[];
  comparisons: Array<{
    from: string;
    to: string;
    topSourceChanged: boolean;
    deniedCandidateDelta: number;
    newlyVisiblePaths: string[];
    noLongerVisiblePaths: string[];
  }>;
};

export type RetrievalPermissionPersonaRun = {
  id: string;
  label: string;
  roles: string[];
  teamSlugs: string[];
  diagnosticsStatus: RetrievalDiagnostics["status"];
  recommendedAction: RetrievalDiagnostics["recommendedAction"];
  allowedCandidateCount: number;
  deniedCandidateCount: number;
  deniedByVisibility: Record<string, number>;
  topSourcePath: string | null;
  topSourceTitle: string | null;
  topSourceVisibility: string | null;
  topSourceScore: number;
  candidates: Array<{
    rank: number;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    score: number;
    reasonCodes: string[];
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

export type RankingExplanation = {
  method: "weighted_vector_lexical_v1" | "rrf_hybrid_v1" | "local_bm25_keytoken_rerank_v1" | "embedding_cosine_rerank_v1";
  matchedQueryTerms: string[];
  unmatchedQueryTerms: string[];
  scoreContributions: Array<{
    signal: "vector" | "lexical" | "rrf" | "rerank";
    label: string;
    weight?: number;
    value: number;
    contribution: number;
    evidence: string;
  }>;
  accessDecision: {
    decision: "allowed";
    enforcement: PermissionBoundaryAudit["enforcement"];
    reason: string;
  };
  reasonCodes: string[];
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

    if (isDocumentInventoryQuestion(question)) {
      return this.answerDocumentInventoryQuestion(questionRow.id, question, context, connection);
    }

    const toolUseAnswer = await this.askWithToolUse(questionRow.id, question, context);
    if (toolUseAnswer) {
      return toolUseAnswer;
    }

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
    const unsupportedConfidenceThreshold = Number(process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD ?? 0.15);
    const reviewReasons = buildReviewReasons({
      sourceCount: sources.length,
      confidence,
      confidenceThreshold,
      sensitiveAction
    });
    const needsHumanReview = reviewReasons.length > 0;
    const answer = await this.answerGenerator.generate({
      question,
      sources,
      confidence,
      unsupportedConfidenceThreshold,
      needsHumanReview,
      sensitiveAction,
      checklist
    });
    const groundedSources = selectGroundedSourcesForAnswer(sources, confidence, unsupportedConfidenceThreshold);
    const documentAgreement = await calculateAnswerDocumentAgreement(
      answer,
      groundedSources.map((source) => source.content)
    );
    const contextPackage = buildContextPackage(groundedSources);

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
          sourceCount: groundedSources.length,
          candidateSourceCount: sources.length,
          sources: groundedSources.map((source, index) => ({
            documentId: source.documentId,
            chunkId: source.chunkId,
            path: source.path,
            title: source.title,
            score: source.score,
            rank: index + 1
          })),
          documentAgreement,
          contextPackage,
          reviewReasons,
          checklist: checklist ? { path: checklist.path, itemCount: checklist.items.length } : null
        })
      ]
    );

    for (const [index, source] of groundedSources.entries()) {
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
          JSON.stringify({ question, policy: "민감 작업은 실행 전에 사람 승인이 필요합니다." })
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
      sources: groundedSources.map((source) => ({
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

  private async askWithToolUse(questionId: string, question: string, context: RequestContext): Promise<AskResponse | null> {
    if (process.env.AGENT_ORCHESTRATION !== "tool_use") {
      return null;
    }

    const chatProvider = createChatProviderFromEnv();
    if (!chatProvider?.completeWithTools) {
      return null;
    }

    const connection = this.orm.em.fork().getConnection();
    const state: AgenticToolState = {
      sources: [],
      permissionAudit: emptyPermissionAudit(context),
      checklist: null,
      sensitiveAction: false,
      approvalRequested: false,
      toolCalls: []
    };

    const result = await chatProvider.completeWithTools({
      temperature: 0.1,
      maxTurns: Number(process.env.AGENT_TOOL_USE_MAX_TURNS ?? 4),
      system:
        "당신은 운영 지원 에이전트 OpsPilot입니다. 답변하기 전에 필요한 도구를 직접 선택하세요. 문서 근거가 필요하면 search_documents를 먼저 호출하세요. 장애 대응 순서가 필요하면 검색 후 create_runbook_checklist를 호출하세요. 운영 DB 변경, 권한 부여, 삭제, 강제 환불 같은 민감 작업은 직접 실행하지 말고 request_human_approval을 호출하세요. 최종 답변은 검색된 출처와 도구 결과만 근거로 한국어로 작성하세요.",
      user: `질문: ${question}\n호출자 역할: ${context.roles.join(",") || "없음"}\n호출자 팀: ${context.teamSlugs.join(",") || "없음"}`,
      tools: AGENTIC_TOOL_DEFINITIONS,
      executeTool: async (tool) => {
        if (tool.name === "search_documents") {
          const query = readString(tool.input.query) || question;
          const limit = readNumber(tool.input.limit, 5);
          const { results, permissionAudit } = await this.searchService.searchWithAudit(query, context, limit);
          state.sources = results;
          state.permissionAudit = permissionAudit;
          const output = { sourceCount: results.length, paths: results.map((source) => source.path), permissionAudit };
          await logToolCall(connection, questionId, "search_documents", { ...tool.input, query, limit, modelToolUseId: tool.id, actor: context }, output, ToolCallStatus.Allowed);
          state.toolCalls.push({ toolName: "search_documents", status: ToolCallStatus.Allowed });
          return { output };
        }

        if (tool.name === "list_documents") {
          const limit = readNumber(tool.input.limit, 20);
          const { sources, permissionAudit } = await this.listAccessibleDocumentSources(connection, context, limit);
          state.sources = sources;
          state.permissionAudit = permissionAudit;
          const output = {
            documentCount: sources.length,
            documents: sources.map((source) => ({
              title: source.title,
              path: source.path,
              visibility: source.visibility,
              teamSlug: source.teamSlug ?? null,
              chunkCount: readMetadataNumber(source.metadata.chunkCount)
            })),
            permissionAudit
          };
          await logToolCall(connection, questionId, "list_documents", { ...tool.input, limit, modelToolUseId: tool.id, actor: context }, output, ToolCallStatus.Allowed);
          state.toolCalls.push({ toolName: "list_documents", status: ToolCallStatus.Allowed });
          return { output };
        }

        if (tool.name === "create_runbook_checklist") {
          if (state.sources.length === 0) {
            const output = { error: "search_documents must be called before create_runbook_checklist" };
            await logToolCall(connection, questionId, "create_runbook_checklist", { ...tool.input, modelToolUseId: tool.id }, output, ToolCallStatus.Failed);
            state.toolCalls.push({ toolName: "create_runbook_checklist", status: ToolCallStatus.Failed });
            return { output, isError: true };
          }

          const checklist = this.runbookChecklist.create(readString(tool.input.question) || question, state.sources);
          state.checklist = checklist;
          const output = checklist
            ? { matched: true, title: checklist.title, path: checklist.path, itemCount: checklist.items.length, items: checklist.items }
            : { matched: false, itemCount: 0, items: [] };
          await logToolCall(connection, questionId, "create_runbook_checklist", { ...tool.input, question, modelToolUseId: tool.id }, output, ToolCallStatus.Allowed);
          state.toolCalls.push({ toolName: "create_runbook_checklist", status: ToolCallStatus.Allowed });
          return { output };
        }

        if (tool.name === "request_human_approval") {
          state.sensitiveAction = true;
          state.approvalRequested = true;
          const output = await this.createApprovalRequest(connection, questionId, question, { modelToolUseId: tool.id, ...tool.input });
          state.toolCalls.push({ toolName: "request_human_approval", status: ToolCallStatus.NeedsApproval });
          return { output };
        }

        const output = { error: `Unknown tool: ${tool.name}` };
        await logToolCall(connection, questionId, tool.name, { ...tool.input, modelToolUseId: tool.id }, output, ToolCallStatus.Failed);
        state.toolCalls.push({ toolName: tool.name, status: ToolCallStatus.Failed });
        return { output, isError: true };
      }
    });

    const policySensitiveAction = this.authz.isSensitiveAction(question);
    if (policySensitiveAction && !state.approvalRequested) {
      const output = await this.createApprovalRequest(connection, questionId, question, { policyEnforced: true });
      state.toolCalls.push({ toolName: "request_human_approval", status: ToolCallStatus.NeedsApproval });
      state.sensitiveAction = true;
      state.approvalRequested = true;
      result.toolCalls.push({
        id: "policy_enforced_approval",
        name: "request_human_approval",
        input: { policyEnforced: true },
        output,
        isError: false
      });
    }

    const confidence = calculateConfidence(state.sources);
    const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3);
    const unsupportedConfidenceThreshold = Number(process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD ?? 0.15);
    const reviewReasons = buildReviewReasons({
      sourceCount: state.sources.length,
      confidence,
      confidenceThreshold,
      sensitiveAction: state.sensitiveAction || policySensitiveAction
    });
    const needsHumanReview = reviewReasons.length > 0;
    const generateGuardedAnswer = () =>
      this.answerGenerator.generate({
        question,
        sources: state.sources,
        confidence,
        unsupportedConfidenceThreshold,
        needsHumanReview,
        sensitiveAction: state.sensitiveAction || policySensitiveAction,
        checklist: state.checklist
      });
    const answer =
      confidence < unsupportedConfidenceThreshold
        ? await generateGuardedAnswer()
        : result.text ||
          (await generateGuardedAnswer());
    const groundedSources = selectGroundedSourcesForAnswer(state.sources, confidence, unsupportedConfidenceThreshold);
    const documentAgreement = await calculateAnswerDocumentAgreement(
      answer,
      groundedSources.map((source) => source.content)
    );
    const contextPackage = buildContextPackage(groundedSources);

    const [answerRow] = await connection.execute<{ id: string }[]>(
      `
        insert into answers (question_id, text, confidence, needs_human_review, metadata)
        values (?::uuid, ?, ?, ?, ?::jsonb)
        returning id;
      `,
      [
        questionId,
        answer,
        confidence,
        needsHumanReview,
        JSON.stringify({
          sensitiveAction: state.sensitiveAction || policySensitiveAction,
          sourceCount: groundedSources.length,
          candidateSourceCount: state.sources.length,
          sources: groundedSources.map((source, index) => ({
            documentId: source.documentId,
            chunkId: source.chunkId,
            path: source.path,
            title: source.title,
            score: source.score,
            rank: index + 1
          })),
          documentAgreement,
          contextPackage,
          reviewReasons,
          checklist: state.checklist ? { path: state.checklist.path, itemCount: state.checklist.items.length } : null,
          orchestration: {
            mode: "anthropic_tool_use",
            turns: result.turns,
            stopReason: result.stopReason,
            modelToolCalls: result.toolCalls.map((tool) => ({
              id: tool.id,
              name: tool.name,
              input: tool.input,
              output: tool.output,
              isError: tool.isError
            }))
          }
        })
      ]
    );

    for (const [index, source] of groundedSources.entries()) {
      await connection.execute(
        `
          insert into answer_sources (answer_id, document_id, chunk_id, score, rank)
          values (?::uuid, ?::uuid, ?::uuid, ?, ?);
        `,
        [answerRow.id, source.documentId, source.chunkId, source.score, index + 1]
      );
    }

    return {
      questionId,
      answerId: answerRow.id,
      answer,
      confidence,
      documentAgreement,
      needsHumanReview,
      reviewReasons,
      sources: groundedSources.map((source) => ({
        documentId: source.documentId,
        chunkId: source.chunkId,
        title: source.title,
        path: source.path,
        score: source.score
      })),
      toolCalls: state.toolCalls,
      permissionAudit: state.permissionAudit
    };
  }

  private async createApprovalRequest(
    connection: { execute<T = unknown>(query: string, params?: unknown[]): Promise<T> },
    questionId: string,
    question: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    await connection.execute(
      `
        insert into approval_requests (question_id, action, reason, status)
        values (?::uuid, ?, ?::jsonb, 'pending');
      `,
      [
        questionId,
        "sensitive_operation",
        JSON.stringify({ question, policy: "민감 작업은 실행 전에 사람 승인이 필요합니다.", ...input })
      ]
    );
    const output = { approvalStatus: "pending" };
    await logToolCall(connection, questionId, "request_human_approval", { action: "sensitive_operation", ...input }, output, ToolCallStatus.NeedsApproval);
    return output;
  }

  private async answerDocumentInventoryQuestion(
    questionId: string,
    question: string,
    context: RequestContext,
    connection: SqlConnection
  ): Promise<AskResponse> {
    const { sources, permissionAudit } = await this.listAccessibleDocumentSources(connection, context, 20);
    const answer = formatDocumentInventoryAnswer(sources);
    const confidence = 0.99;
    const reviewReasons: ReviewReason[] = [];
    const needsHumanReview = false;
    const documentAgreement = await calculateAnswerDocumentAgreement(
      answer,
      sources.map((source) => source.content)
    );
    const contextPackage = buildContextPackage(sources);

    await logToolCall(
      connection,
      questionId,
      "list_documents",
      { question, limit: 20, actor: context },
      {
        documentCount: sources.length,
        paths: sources.map((source) => source.path),
        permissionAudit
      },
      ToolCallStatus.Allowed
    );

    const [answerRow] = await connection.execute<{ id: string }[]>(
      `
        insert into answers (question_id, text, confidence, needs_human_review, metadata)
        values (?::uuid, ?, ?, ?, ?::jsonb)
        returning id;
      `,
      [
        questionId,
        answer,
        confidence,
        needsHumanReview,
        JSON.stringify({
          intent: "document_inventory",
          sourceCount: sources.length,
          sources: sources.map((source, index) => ({
            documentId: source.documentId,
            chunkId: source.chunkId,
            path: source.path,
            title: source.title,
            score: source.score,
            rank: index + 1,
            chunkCount: readMetadataNumber(source.metadata.chunkCount),
            latestVersion: readMetadataNumber(source.metadata.latestVersion)
          })),
          documentAgreement,
          contextPackage,
          reviewReasons
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

    return {
      questionId,
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
      toolCalls: [{ toolName: "list_documents", status: ToolCallStatus.Allowed }],
      permissionAudit
    };
  }

  private async listAccessibleDocumentSources(
    connection: SqlConnection,
    context: RequestContext,
    limit: number
  ): Promise<{ sources: SearchResult[]; permissionAudit: PermissionBoundaryAudit }> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const access = this.authz.retrievalWhereClause(context);
    const rows = (await connection.execute<DocumentInventoryToolRow[]>(
      `
        select
          d.id as "documentId",
          (array_agg(c.id order by c.chunk_index) filter (where c.id is not null))[1] as "chunkId",
          d.title,
          d.path,
          d.visibility,
          d.team_slug as "teamSlug",
          count(distinct c.id)::int as "chunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          d.updated_at as "updatedAt"
        from documents d
        left join document_chunks c on c.document_id = d.id
        left join document_versions v on v.document_id = d.id
        where ${access.sql}
        group by d.id
        having (array_agg(c.id order by c.chunk_index) filter (where c.id is not null))[1] is not null
        order by d.updated_at desc
        limit ?;
      `,
      [...access.params, safeLimit]
    )) as DocumentInventoryToolRow[];
    const permissionAudit = await this.buildDocumentInventoryPermissionAudit(connection, context);

    return {
      permissionAudit,
      sources: rows.map((row) => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        title: row.title,
        path: row.path,
        visibility: row.visibility,
        teamSlug: row.teamSlug,
        content: [
          `문서 제목: ${row.title}`,
          `문서 경로: ${row.path}`,
          `공개 범위: ${formatDocumentVisibility(row.visibility)}`,
          row.teamSlug ? `팀: ${row.teamSlug}` : null,
          `청크 수: ${Number(row.chunkCount)}개`,
          `최신 버전: ${Number(row.latestVersion)}`
        ]
          .filter(Boolean)
          .join("\n"),
        score: 1,
        metadata: {
          source: "document_inventory",
          chunkCount: Number(row.chunkCount),
          latestVersion: Number(row.latestVersion),
          updatedAt: row.updatedAt
        },
        retrieval: {
          mode: "vector",
          vectorScore: 1,
          lexicalScore: 1
        }
      }))
    };
  }

  private async buildDocumentInventoryPermissionAudit(
    connection: SqlConnection,
    context: RequestContext
  ): Promise<PermissionBoundaryAudit> {
    const rows = (await connection.execute<Array<{ visibility: string; teamSlug?: string | null }>>(
      `
        select visibility, team_slug as "teamSlug"
        from documents;
      `
    )) as Array<{ visibility: string; teamSlug?: string | null }>;
    const deniedByVisibility: Record<string, number> = {};
    let allowedCandidateCount = 0;
    let deniedCandidateCount = 0;

    for (const row of rows) {
      if (this.authz.canAccessDocument(context, row.visibility, row.teamSlug)) {
        allowedCandidateCount += 1;
      } else {
        deniedCandidateCount += 1;
        deniedByVisibility[row.visibility] = (deniedByVisibility[row.visibility] ?? 0) + 1;
      }
    }

    return {
      enforcement: "pre_ranking_sql_filter",
      candidateWindow: rows.length,
      allowedCandidateCount,
      deniedCandidateCount,
      deniedByVisibility,
      actor: {
        roles: context.roles,
        teamSlugs: context.teamSlugs
      }
    };
  }

  async previewRetrieval(question: string, context: RequestContext, limit = 5): Promise<RetrievalPreviewResponse> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const { results, permissionAudit } = await this.searchService.searchWithAudit(question, context, safeLimit);

    return buildRetrievalPreview(question, safeLimit, results, permissionAudit);
  }

  async profileRetrieval(question: string, context: RequestContext, limit = 5): Promise<RetrievalProfileReport> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const startedAt = Date.now();
    const normalizeStartedAt = Date.now();
    const queryTerms = extractQueryTerms(question);
    const normalizeMs = elapsedMs(normalizeStartedAt);

    const searchStartedAt = Date.now();
    const { results, permissionAudit } = await this.searchService.searchWithAudit(question, context, safeLimit);
    const searchMs = elapsedMs(searchStartedAt);

    const diagnosticsStartedAt = Date.now();
    const diagnostics = buildRetrievalDiagnostics(question, results, permissionAudit);
    const diagnosticsMs = elapsedMs(diagnosticsStartedAt);

    const packagingStartedAt = Date.now();
    const preview = buildRetrievalPreview(question, safeLimit, results, permissionAudit, diagnostics);
    const candidatePackagingMs = elapsedMs(packagingStartedAt);
    const endToEndMs = elapsedMs(startedAt);
    const latencyBudgetMs = Number(process.env.RETRIEVAL_PROFILE_LATENCY_BUDGET_MS ?? 500);
    const latencyBudgetStatus = latencyStatus(endToEndMs, latencyBudgetMs);
    const stages = buildRetrievalProfileStages({
      queryTerms,
      results,
      permissionAudit,
      diagnostics,
      normalizeMs,
      searchMs,
      diagnosticsMs,
      candidatePackagingMs,
      endToEndMs,
      latencyBudgetMs
    });
    const status: RetrievalProfileReport["status"] =
      diagnostics.status === "blocked" || stages.some((stage) => stage.status === "fail")
        ? "risk"
        : diagnostics.status === "review" || stages.some((stage) => stage.status === "warn")
          ? "watch"
          : "optimized";
    const summary = {
      endToEndMs,
      searchMs,
      diagnosticsMs,
      candidatePackagingMs,
      allowedCandidateCount: permissionAudit.allowedCandidateCount,
      deniedCandidateCount: permissionAudit.deniedCandidateCount,
      candidateWindow: permissionAudit.candidateWindow,
      confidenceEstimate: round(diagnostics.confidenceEstimate),
      topScore: round(diagnostics.topScore),
      scoreGap: round(diagnostics.scoreGap),
      contextTokenUseRatio: round(diagnostics.contextPackage.estimatedTokenCount / diagnostics.contextPackage.tokenBudget),
      mode: diagnostics.queryPlan.mode,
      latencyBudgetMs,
      latencyBudgetStatus
    };
    const summaryHashBasis = {
      allowedCandidateCount: summary.allowedCandidateCount,
      deniedCandidateCount: summary.deniedCandidateCount,
      candidateWindow: summary.candidateWindow,
      confidenceEstimate: summary.confidenceEstimate,
      topScore: summary.topScore,
      scoreGap: summary.scoreGap,
      contextTokenUseRatio: summary.contextTokenUseRatio,
      mode: summary.mode,
      latencyBudgetMs: summary.latencyBudgetMs,
      latencyBudgetStatus: summary.latencyBudgetStatus
    };
    const hashBasis = {
      schemaVersion: "opspilot.retrieval_profile.v1",
      query: question,
      limit: safeLimit,
      status,
      summary: summaryHashBasis,
      permissionAudit,
      candidates: preview.candidates.map((candidate) => ({
        rank: candidate.rank,
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        path: candidate.path,
        score: candidate.score,
        retrieval: candidate.retrieval,
        heading: candidate.heading
      })),
      diagnostics: {
        status: diagnostics.status,
        recommendedAction: diagnostics.recommendedAction,
        checks: diagnostics.checks.map((check) => ({ id: check.id, status: check.status, metric: check.metric })),
        queryPlan: diagnostics.queryPlan
      }
    };
    const profileHash = sha256(stableStringify(hashBasis));

    return {
      schemaVersion: "opspilot.retrieval_profile.v1",
      generatedAt: new Date().toISOString(),
      query: question,
      limit: safeLimit,
      status,
      profileHash,
      summary,
      stages,
      bottlenecks: buildRetrievalProfileBottlenecks({ diagnostics, permissionAudit, stages, summary }),
      preview,
      integrity: {
        algorithm: "sha256",
        canonicalization: "stable_json_v1",
        hash: profileHash,
        includedFields: ["query", "limit", "permissionAudit", "candidates", "diagnostics.queryPlan", "diagnostics.checks"]
      }
    };
  }

  async analyzeRetrievalRobustness(
    question: string,
    context: RequestContext,
    variants: string[] = [],
    limit = 5
  ): Promise<RetrievalRobustnessReport> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const uniqueQueries = buildRobustnessQueries(question, variants);
    const previews = await Promise.all(uniqueQueries.map((query) => this.previewRetrieval(query, context, safeLimit)));
    const baselinePreview = previews[0];
    const baselinePaths = baselinePreview.candidates.map((candidate) => candidate.path);
    const baselineTopPath = baselinePaths[0] ?? null;
    const runs = previews.map((preview, index) => toRobustnessRun(preview, index + 1, baselinePaths, baselineTopPath));
    const baseline = runs[0];
    const variantRuns = runs.slice(1);
    const allRuns = variantRuns.length > 0 ? variantRuns : runs;
    const topSourceStability = average(allRuns.map((run) => (run.topSourceMatchesBaseline ? 1 : 0)));
    const averageSourceOverlap = average(allRuns.map((run) => run.sourceOverlapWithBaseline));
    const averageConfidenceEstimate = average(runs.map((run) => run.confidenceEstimate));
    const maxScoreDelta = Math.max(...runs.map((run) => Math.abs(run.topScore - baseline.topScore)), 0);
    const permissionDeniedTotal = runs.reduce((sum, run) => sum + run.permissionDeniedCount, 0);
    const checks = buildRobustnessChecks({
      variantCount: variantRuns.length,
      topSourceStability,
      averageSourceOverlap,
      averageConfidenceEstimate,
      maxScoreDelta,
      permissionDeniedTotal
    });
    const status = checks.some((check) => check.status === "fail")
      ? "unstable"
      : checks.some((check) => check.status === "warn")
        ? "review"
        : "stable";

    return {
      schemaVersion: "opspilot.retrieval_robustness.v1",
      generatedAt: new Date().toISOString(),
      baselineQuestion: question,
      status,
      recommendedAction:
        status === "stable" ? "answer" : status === "review" ? "review_top_sources" : "rewrite_query_or_add_docs",
      summary: {
        variantCount: variantRuns.length,
        topSourceStability: round(topSourceStability),
        averageSourceOverlap: round(averageSourceOverlap),
        averageConfidenceEstimate: round(averageConfidenceEstimate),
        maxScoreDelta: round(maxScoreDelta),
        permissionDeniedTotal
      },
      checks,
      baseline,
      variants: variantRuns
    };
  }

  async analyzeRetrievalPermissionDiff(
    question: string,
    context: RequestContext,
    personas: Array<{ id: string; label: string; roles?: string[]; teamSlugs?: string[] }> = [],
    limit = 5
  ): Promise<RetrievalPermissionDiffReport> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const normalizedPersonas = normalizePermissionDiffPersonas(context, personas);
    const previews = await Promise.all(
      normalizedPersonas.map((persona) =>
        this.previewRetrieval(question, { roles: persona.roles, teamSlugs: persona.teamSlugs }, safeLimit)
      )
    );
    const runs = previews.map((preview, index) => toPermissionPersonaRun(normalizedPersonas[index], preview));
    const comparisons = buildPermissionComparisons(runs);
    const unprivilegedRestrictedCandidateCount = runs
      .filter((run) => !hasPrivilegedRole(run.roles))
      .reduce((sum, run) => sum + run.candidates.filter((candidate) => candidate.visibility === "restricted").length, 0);
    const privilegedRestrictedCandidateCount = runs
      .filter((run) => hasPrivilegedRole(run.roles))
      .reduce((sum, run) => sum + run.candidates.filter((candidate) => candidate.visibility === "restricted").length, 0);
    const topSourceChangedCount = comparisons.filter((comparison) => comparison.topSourceChanged).length;
    const summary = {
      personaCount: runs.length,
      uniqueTopSourceCount: new Set(runs.map((run) => run.topSourcePath).filter(Boolean)).size,
      maxDeniedCandidateCount: Math.max(0, ...runs.map((run) => run.deniedCandidateCount)),
      unprivilegedRestrictedCandidateCount,
      privilegedRestrictedCandidateCount,
      topSourceChangedCount
    };
    const checks = buildPermissionDiffChecks(runs, summary);

    return {
      schemaVersion: "opspilot.retrieval_permission_diff.v1",
      generatedAt: new Date().toISOString(),
      query: question,
      status: checks.some((check) => check.status === "fail") ? "review" : "isolated",
      summary,
      checks,
      personas: runs,
      comparisons
    };
  }

}

function buildRankingExplanation(
  question: string,
  source: SearchResult,
  permissionAudit: PermissionBoundaryAudit
): RankingExplanation {
  const queryTerms = extractQueryTerms(question);
  const haystack = `${source.title} ${source.path} ${source.content}`.toLowerCase();
  const matchedQueryTerms = queryTerms.filter((term) => haystack.includes(term.toLowerCase()));
  const unmatchedQueryTerms = queryTerms.filter((term) => !matchedQueryTerms.includes(term));
  const reasonCodes = [
    source.retrieval.rerankMethod ? rerankReasonCode(source.retrieval.rerankMethod) : null,
    source.retrieval.mode === "hybrid" ? "hybrid_rank_fusion" : "weighted_vector_lexical",
    matchedQueryTerms.length > 0 ? "query_term_overlap" : "semantic_only",
    "permission_allowed",
    source.visibility === "team" ? "team_scoped_source" : source.visibility === "restricted" ? "restricted_source_allowed" : "public_source"
  ].filter((reason): reason is string => Boolean(reason));

  return {
    method: rankingMethod(source),
    matchedQueryTerms,
    unmatchedQueryTerms,
    scoreContributions: buildScoreContributions(source),
    accessDecision: {
      decision: "allowed",
      enforcement: permissionAudit.enforcement,
      reason: buildAccessReason(source)
    },
    reasonCodes
  };
}

function rankingMethod(source: SearchResult): RankingExplanation["method"] {
  if (source.retrieval.rerankMethod === "embedding_cosine_v1") {
    return "embedding_cosine_rerank_v1";
  }

  if (source.retrieval.rerankMethod === "local_bm25_keytoken_v1") {
    return "local_bm25_keytoken_rerank_v1";
  }

  return source.retrieval.mode === "hybrid" ? "rrf_hybrid_v1" : "weighted_vector_lexical_v1";
}

function rerankReasonCode(method: RerankMethod): string {
  return method === "embedding_cosine_v1" ? "embedding_cosine_rerank" : "local_bm25_keytoken_rerank";
}

function rerankEvidence(method?: RerankMethod): string {
  if (method === "embedding_cosine_v1") {
    return "질문과 후보 청크를 현재 임베딩 provider로 벡터화한 뒤 cosine similarity와 기존 검색 점수를 결합해 최종 순위를 재정렬했습니다.";
  }

  return "BM25 계열 점수, 오류 코드/지표/경로 핵심 토큰, 제목·경로 일치, 기존 검색 점수를 결합해 최종 순위를 재정렬했습니다.";
}

function normalizePermissionDiffPersonas(
  context: RequestContext,
  personas: Array<{ id: string; label: string; roles?: string[]; teamSlugs?: string[] }>
): Array<{ id: string; label: string; roles: string[]; teamSlugs: string[] }> {
  if (personas.length > 0) {
    return personas.slice(0, 6).map((persona) => ({
      id: sanitizePersonaId(persona.id),
      label: persona.label,
      roles: [...new Set(persona.roles ?? [])],
      teamSlugs: [...new Set(persona.teamSlugs ?? [])]
    }));
  }

  const currentActor =
    context.roles.length > 0 || context.teamSlugs.length > 0
      ? [
          {
            id: "current_actor",
            label: "현재 호출자",
            roles: context.roles,
            teamSlugs: context.teamSlugs
          }
        ]
      : [];

  return [
    ...currentActor,
    { id: "public_viewer", label: "공개 사용자", roles: [], teamSlugs: [] },
    { id: "support_agent", label: "고객지원 담당자", roles: ["support_agent"], teamSlugs: [] },
    { id: "payments_oncall", label: "결제 온콜", roles: ["support_agent", "oncall"], teamSlugs: ["payments"] },
    { id: "ops_admin", label: "운영 관리자", roles: ["ops_admin"], teamSlugs: ["payments"] }
  ].slice(0, 6);
}

function toPermissionPersonaRun(
  persona: { id: string; label: string; roles: string[]; teamSlugs: string[] },
  preview: RetrievalPreviewResponse
): RetrievalPermissionPersonaRun {
  const topCandidate = preview.candidates[0];

  return {
    id: persona.id,
    label: persona.label,
    roles: persona.roles,
    teamSlugs: persona.teamSlugs,
    diagnosticsStatus: preview.diagnostics.status,
    recommendedAction: preview.diagnostics.recommendedAction,
    allowedCandidateCount: preview.permissionAudit.allowedCandidateCount,
    deniedCandidateCount: preview.permissionAudit.deniedCandidateCount,
    deniedByVisibility: preview.permissionAudit.deniedByVisibility,
    topSourcePath: topCandidate?.path ?? null,
    topSourceTitle: topCandidate?.title ?? null,
    topSourceVisibility: topCandidate?.visibility ?? null,
    topSourceScore: topCandidate?.score ?? 0,
    candidates: preview.candidates.slice(0, 5).map((candidate) => ({
      rank: candidate.rank,
      path: candidate.path,
      title: candidate.title,
      visibility: candidate.visibility,
      teamSlug: candidate.teamSlug,
      score: candidate.score,
      reasonCodes: candidate.rankingExplanation.reasonCodes
    }))
  };
}

function buildPermissionComparisons(
  runs: RetrievalPermissionPersonaRun[]
): RetrievalPermissionDiffReport["comparisons"] {
  const comparisons: RetrievalPermissionDiffReport["comparisons"] = [];
  for (let index = 1; index < runs.length; index += 1) {
    const previous = runs[index - 1];
    const current = runs[index];
    const previousPaths = new Set(previous.candidates.map((candidate) => candidate.path));
    const currentPaths = new Set(current.candidates.map((candidate) => candidate.path));

    comparisons.push({
      from: previous.id,
      to: current.id,
      topSourceChanged: previous.topSourcePath !== current.topSourcePath,
      deniedCandidateDelta: current.deniedCandidateCount - previous.deniedCandidateCount,
      newlyVisiblePaths: [...currentPaths].filter((path) => !previousPaths.has(path)).slice(0, 6),
      noLongerVisiblePaths: [...previousPaths].filter((path) => !currentPaths.has(path)).slice(0, 6)
    });
  }

  return comparisons;
}

function buildPermissionDiffChecks(
  runs: RetrievalPermissionPersonaRun[],
  summary: RetrievalPermissionDiffReport["summary"]
): RetrievalPermissionDiffReport["checks"] {
  const teamScopedLeakCount = runs.reduce(
    (sum, run) =>
      sum +
      run.candidates.filter(
        (candidate) =>
          candidate.visibility === "team" && Boolean(candidate.teamSlug) && !run.teamSlugs.includes(candidate.teamSlug ?? "")
      ).length,
    0
  );
  const allCandidateWindowsAudited = runs.every((run) => run.allowedCandidateCount + run.deniedCandidateCount > 0);

  return [
    {
      id: "restricted_isolation",
      label: "제한 문서 격리",
      status: summary.unprivilegedRestrictedCandidateCount === 0 ? "pass" : "fail",
      metric: summary.unprivilegedRestrictedCandidateCount,
      threshold: 0,
      message:
        summary.unprivilegedRestrictedCandidateCount === 0
          ? "권한 없는 페르소나의 후보 목록에 제한 문서가 노출되지 않았습니다."
          : `권한 없는 페르소나에 제한 문서 후보 ${summary.unprivilegedRestrictedCandidateCount}개가 노출됐습니다.`
    },
    {
      id: "team_scope",
      label: "팀 범위 격리",
      status: teamScopedLeakCount === 0 ? "pass" : "fail",
      metric: teamScopedLeakCount,
      threshold: 0,
      message:
        teamScopedLeakCount === 0
          ? "팀 권한이 없는 페르소나에는 팀 한정 문서가 노출되지 않았습니다."
          : `팀 권한 없는 페르소나에 팀 한정 문서 후보 ${teamScopedLeakCount}개가 노출됐습니다.`
    },
    {
      id: "privileged_visibility",
      label: "관리자 가시성",
      status: summary.privilegedRestrictedCandidateCount > 0 ? "pass" : "warn",
      metric: summary.privilegedRestrictedCandidateCount,
      threshold: 1,
      message:
        summary.privilegedRestrictedCandidateCount > 0
          ? "관리자 페르소나가 질문 의도에 맞는 제한 문서 후보를 볼 수 있습니다."
          : "이번 질문에서는 관리자 페르소나에도 제한 문서 후보가 상위권에 오르지 않았습니다."
    },
    {
      id: "top_source_diff",
      label: "출처 차이",
      status: summary.topSourceChangedCount > 0 ? "pass" : "warn",
      metric: summary.topSourceChangedCount,
      threshold: 1,
      message:
        summary.topSourceChangedCount > 0
          ? "권한 차이에 따라 1순위 출처가 달라지는 것을 확인했습니다."
          : "모든 페르소나의 1순위 출처가 같습니다."
    },
    {
      id: "candidate_window",
      label: "후보 창 감사",
      status: allCandidateWindowsAudited ? "pass" : "fail",
      metric: runs.length,
      threshold: runs.length,
      message: allCandidateWindowsAudited
        ? "모든 페르소나에서 허용/차단 후보 창이 계산됐습니다."
        : "일부 페르소나의 후보 창 감사가 비어 있습니다."
    }
  ];
}

function hasPrivilegedRole(roles: string[]): boolean {
  return roles.includes("ops_admin") || roles.includes("security_admin");
}

function sanitizePersonaId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 40) || "persona";
}

function buildScoreContributions(source: SearchResult): RankingExplanation["scoreContributions"] {
  const rerankContribution = source.retrieval.rerankScore
    ? [
        {
          signal: "rerank" as const,
          label: "리랭킹",
          value: Number(source.retrieval.rerankScore.toFixed(6)),
          contribution: Number((source.retrieval.rerankScore - (source.retrieval.baseScore ?? 0)).toFixed(6)),
          evidence: rerankEvidence(source.retrieval.rerankMethod)
        }
      ]
    : [];

  if (source.retrieval.mode === "hybrid") {
    return [
      ...rerankContribution,
      {
        signal: "rrf",
        label: "RRF 결합",
        value: Number((source.retrieval.fusedScore ?? source.score).toFixed(6)),
        contribution: Number(source.score.toFixed(6)),
        evidence: "벡터 순위와 Elasticsearch 키워드 순위를 reciprocal rank fusion으로 결합했습니다."
      },
      {
        signal: "vector",
        label: "벡터 후보",
        value: Number((source.retrieval.vectorScore ?? 0).toFixed(6)),
        contribution: Number((source.retrieval.vectorScore ?? 0).toFixed(6)),
        evidence: "의미 유사도 후보가 결합 점수에 기여했습니다."
      },
      {
        signal: "lexical",
        label: "키워드 후보",
        value: Number((source.retrieval.lexicalScore ?? 0).toFixed(6)),
        contribution: Number((source.retrieval.lexicalScore ?? 0).toFixed(6)),
        evidence: "키워드 검색 후보가 결합 점수에 기여했습니다."
      }
    ];
  }

  const vectorScore = source.retrieval.vectorScore ?? 0;
  const lexicalScore = source.retrieval.lexicalScore ?? 0;

  return [
    ...rerankContribution,
    {
      signal: "vector",
      label: "벡터 유사도",
      weight: 0.45,
      value: Number(vectorScore.toFixed(6)),
      contribution: Number((vectorScore * 0.45).toFixed(6)),
      evidence: "질문 임베딩과 문서 청크 임베딩 간 pgvector 코사인 유사도입니다."
    },
    {
      signal: "lexical",
      label: "키워드 매칭",
      weight: 0.55,
      value: Number(lexicalScore.toFixed(6)),
      contribution: Number((lexicalScore * 0.55).toFixed(6)),
      evidence: "질문에서 추출한 검색어가 제목, 경로, 본문에 포함된 비율입니다."
    }
  ];
}

function buildAccessReason(source: SearchResult): string {
  if (source.visibility === "public") {
    return "전체 공개 문서는 모든 호출자가 답변 컨텍스트로 사용할 수 있습니다.";
  }
  if (source.visibility === "team") {
    return `${source.teamSlug ?? "팀"} 팀 범위 문서이며 호출자 팀 권한과 일치해 허용됐습니다.`;
  }
  if (source.visibility === "restricted") {
    return "제한 문서이지만 호출자 역할/팀 정책이 허용해 답변 컨텍스트에 포함됐습니다.";
  }
  return `${source.visibility} 문서가 권한 정책을 통과했습니다.`;
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
      message: "현재 호출자가 접근할 수 있는 출처 청크를 찾지 못했습니다."
    });
  }

  if (input.confidence < input.confidenceThreshold) {
    reasons.push({
      code: "low_confidence",
      message: "검색 신뢰도가 설정된 검토 기준보다 낮습니다.",
      confidence: input.confidence,
      threshold: input.confidenceThreshold
    });
  }

  if (input.sensitiveAction) {
    reasons.push({
      code: "sensitive_action",
      message: "요청에 운영 환경에 영향을 줄 수 있는 민감 작업이 포함되어 있습니다.",
      policy: "민감 작업은 실행 전에 사람 승인이 필요합니다."
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

export function selectGroundedSourcesForAnswer(
  sources: SearchResult[],
  confidence: number,
  unsupportedConfidenceThreshold: number
): SearchResult[] {
  return confidence < unsupportedConfidenceThreshold ? [] : sources;
}

function buildRetrievalPreview(
  question: string,
  safeLimit: number,
  results: SearchResult[],
  permissionAudit: PermissionBoundaryAudit,
  diagnostics = buildRetrievalDiagnostics(question, results, permissionAudit)
): RetrievalPreviewResponse {
  return {
    query: question,
    limit: safeLimit,
    permissionAudit,
    diagnostics,
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
      rankingExplanation: buildRankingExplanation(question, result, permissionAudit),
      heading: typeof result.metadata.heading === "string" ? result.metadata.heading : null,
      contentPreview: result.content.slice(0, 520)
    }))
  };
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

function buildRetrievalProfileStages(input: {
  queryTerms: string[];
  results: SearchResult[];
  permissionAudit: PermissionBoundaryAudit;
  diagnostics: RetrievalDiagnostics;
  normalizeMs: number;
  searchMs: number;
  diagnosticsMs: number;
  candidatePackagingMs: number;
  endToEndMs: number;
  latencyBudgetMs: number;
}): RetrievalProfileReport["stages"] {
  return [
    {
      id: "normalize_query",
      label: "질문 정규화",
      status: latencyStatus(input.normalizeMs, 5),
      durationMs: input.normalizeMs,
      budgetMs: 5,
      input: "사용자 질문",
      output: input.queryTerms.length > 0 ? input.queryTerms.join(", ") : "검색어 없음",
      evidence: `${input.queryTerms.length}개 검색어를 추출했습니다.`
    },
    {
      id: "search_with_audit",
      label: "검색과 권한 감사",
      status: latencyStatus(input.searchMs, Math.min(350, Math.max(120, input.latencyBudgetMs * 0.7))),
      durationMs: input.searchMs,
      budgetMs: Math.min(350, Math.max(120, input.latencyBudgetMs * 0.7)),
      input: `${input.diagnostics.queryPlan.mode} / 후보 창 ${input.permissionAudit.candidateWindow}`,
      output: `허용 ${input.results.length}개, 차단 ${input.permissionAudit.deniedCandidateCount}개`,
      evidence: `${formatPermissionEnforcementForProfile(input.permissionAudit.enforcement)} · ${formatDeniedByVisibility(input.permissionAudit.deniedByVisibility)}`
    },
    {
      id: "diagnostics",
      label: "품질 진단",
      status: latencyStatus(input.diagnosticsMs, 30),
      durationMs: input.diagnosticsMs,
      budgetMs: 30,
      input: `${input.results.length}개 후보`,
      output: formatRetrievalDiagnosticsStatus(input.diagnostics.status),
      evidence: `신뢰도 ${round(input.diagnostics.confidenceEstimate)}, 점수 격차 ${round(input.diagnostics.scoreGap)}`
    },
    {
      id: "candidate_packaging",
      label: "후보 패키징",
      status: latencyStatus(input.candidatePackagingMs, 30),
      durationMs: input.candidatePackagingMs,
      budgetMs: 30,
      input: "랭킹 설명, 헤딩, 미리보기",
      output: `${input.results.length}개 후보 카드`,
      evidence: input.results[0] ? `1순위 ${input.results[0].path}` : "패키징할 후보 없음"
    },
    {
      id: "release_decision",
      label: "운영 판단",
      status: input.diagnostics.status === "blocked" ? "fail" : input.diagnostics.status === "review" ? "warn" : latencyStatus(input.endToEndMs, input.latencyBudgetMs),
      durationMs: input.endToEndMs,
      budgetMs: input.latencyBudgetMs,
      input: `전체 ${input.endToEndMs}ms`,
      output: formatRecommendedActionForProfile(input.diagnostics.recommendedAction),
      evidence: input.diagnostics.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.label)
        .join(", ") || "검색 품질 체크 통과"
    }
  ];
}

function buildRetrievalProfileBottlenecks(input: {
  diagnostics: RetrievalDiagnostics;
  permissionAudit: PermissionBoundaryAudit;
  stages: RetrievalProfileReport["stages"];
  summary: RetrievalProfileReport["summary"];
}): RetrievalProfileReport["bottlenecks"] {
  const bottlenecks: RetrievalProfileReport["bottlenecks"] = [];
  for (const stage of input.stages) {
    if (stage.durationMs > stage.budgetMs) {
      bottlenecks.push({
        id: `latency_${stage.id}`,
        label: `${stage.label} 지연`,
        severity: stage.status === "fail" ? "critical" : "warn",
        message: `${stage.label} 단계가 ${stage.durationMs}ms로 budget ${stage.budgetMs}ms를 넘었습니다.`,
        action: stage.id === "search_with_audit" ? "후보 창, pgvector 인덱스, Elasticsearch 미러 상태를 확인하세요." : "단계 입력과 출력 크기를 줄이거나 캐시 가능성을 검토하세요."
      });
    }
  }
  for (const check of input.diagnostics.checks.filter((item) => item.status !== "pass")) {
    bottlenecks.push({
      id: `quality_${check.id}`,
      label: check.label,
      severity: check.status === "fail" ? "critical" : "warn",
      message: check.message,
      action: check.id === "permission_boundary" ? "검색 전 권한 필터와 호출자 역할/팀을 확인하세요." : "문서 제목, 별칭, 청크 구조, 평가 케이스를 보강하세요."
    });
  }
  if (input.permissionAudit.deniedCandidateCount > 0) {
    bottlenecks.push({
      id: "permission_denied_candidates",
      label: "권한 차단 후보",
      severity: "info",
      message: `${input.permissionAudit.deniedCandidateCount}개 후보가 권한 경계에서 제외됐습니다.`,
      action: "민감 문서 경로가 답변 후보에 포함되지 않는지 권한별 검색 비교로 재확인하세요."
    });
  }
  if (input.summary.contextTokenUseRatio >= 0.9) {
    bottlenecks.push({
      id: "context_budget_pressure",
      label: "컨텍스트 예산 압박",
      severity: "warn",
      message: `컨텍스트 예산 사용률이 ${Math.round(input.summary.contextTokenUseRatio * 100)}%입니다.`,
      action: "상위 청크 수, 청크 길이, 중복 문서 후보를 조정하세요."
    });
  }
  if (bottlenecks.length === 0) {
    bottlenecks.push({
      id: "profile_clean",
      label: "프로파일 정상",
      severity: "info",
      message: "검색 latency, 권한 경계, 컨텍스트 예산, 품질 진단이 현재 기준을 통과했습니다.",
      action: "현재 프로파일 해시를 배포 전 기준값으로 보관할 수 있습니다."
    });
  }
  return bottlenecks;
}

function buildRobustnessQueries(question: string, variants: string[]): string[] {
  const normalized = [question, ...variants, ...defaultQueryVariants(question)]
    .map((query) => query.trim())
    .filter((query) => query.length >= 2);
  return [...new Set(normalized)].slice(0, 7);
}

function defaultQueryVariants(question: string): string[] {
  const compact = question.replace(/[?？!！.。]+$/u, "").trim();
  const variants = [
    compact,
    `${compact} 알려줘`,
    `${compact} 기준`,
    `${compact} 절차`,
    compact.replace(/무엇이야|뭐야|어떻게|알려줘/gu, "").trim()
  ].filter((variant) => variant.length >= 2 && variant !== question.trim());

  return variants;
}

function toRobustnessRun(
  preview: RetrievalPreviewResponse,
  rank: number,
  baselinePaths: string[],
  baselineTopPath: string | null
): RetrievalRobustnessRun {
  const sourcePaths = preview.candidates.map((candidate) => candidate.path);
  const topCandidate = preview.candidates[0];
  const topSourcePath = topCandidate?.path ?? null;

  return {
    query: preview.query,
    rank,
    diagnosticsStatus: preview.diagnostics.status,
    recommendedAction: preview.diagnostics.recommendedAction,
    confidenceEstimate: round(preview.diagnostics.confidenceEstimate),
    topScore: round(preview.diagnostics.topScore),
    topSourcePath,
    topSourceTitle: topCandidate?.title ?? null,
    sourcePaths,
    sourceOverlapWithBaseline: round(jaccard(sourcePaths, baselinePaths)),
    topSourceMatchesBaseline: baselineTopPath !== null && topSourcePath === baselineTopPath,
    permissionDeniedCount: preview.permissionAudit.deniedCandidateCount,
    queryTerms: preview.diagnostics.queryTerms
  };
}

function buildRobustnessChecks(input: {
  variantCount: number;
  topSourceStability: number;
  averageSourceOverlap: number;
  averageConfidenceEstimate: number;
  maxScoreDelta: number;
  permissionDeniedTotal: number;
}): RetrievalRobustnessReport["checks"] {
  const stabilityThreshold = Number(process.env.RETRIEVAL_ROBUSTNESS_MIN_TOP_SOURCE_STABILITY ?? 0.8);
  const overlapThreshold = Number(process.env.RETRIEVAL_ROBUSTNESS_MIN_SOURCE_OVERLAP ?? 0.55);
  const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3);
  const maxScoreDeltaThreshold = Number(process.env.RETRIEVAL_ROBUSTNESS_MAX_SCORE_DELTA ?? 0.35);

  return [
    {
      id: "top_source_stability",
      label: "1순위 출처 안정성",
      status: thresholdStatus(input.topSourceStability, stabilityThreshold),
      metric: round(input.topSourceStability),
      threshold: stabilityThreshold,
      message:
        input.topSourceStability >= stabilityThreshold
          ? "질문 변형 대부분이 같은 1순위 출처로 수렴합니다."
          : "질문 표현이 조금만 바뀌어도 1순위 출처가 흔들립니다. 문서 제목, 별칭, 키워드 보강이 필요합니다."
    },
    {
      id: "source_overlap",
      label: "출처 겹침",
      status: thresholdStatus(input.averageSourceOverlap, overlapThreshold),
      metric: round(input.averageSourceOverlap),
      threshold: overlapThreshold,
      message:
        input.averageSourceOverlap >= overlapThreshold
          ? "변형 질문의 후보 문서 집합이 기준 질문과 충분히 겹칩니다."
          : "변형 질문이 다른 문서 집합으로 흩어집니다. 관련 런북/정책 문서의 용어 정렬을 확인해야 합니다."
    },
    {
      id: "confidence_floor",
      label: "평균 신뢰도",
      status: thresholdStatus(input.averageConfidenceEstimate, confidenceThreshold),
      metric: round(input.averageConfidenceEstimate),
      threshold: confidenceThreshold,
      message:
        input.averageConfidenceEstimate >= confidenceThreshold
          ? "변형 질문 전체 평균 신뢰도가 답변 기준을 넘습니다."
          : "변형 질문 평균 신뢰도가 낮아 답변 전 검토가 필요합니다."
    },
    {
      id: "score_drift",
      label: "점수 흔들림",
      status: input.maxScoreDelta <= maxScoreDeltaThreshold ? "pass" : input.maxScoreDelta <= maxScoreDeltaThreshold * 1.5 ? "warn" : "fail",
      metric: round(input.maxScoreDelta),
      threshold: maxScoreDeltaThreshold,
      message:
        input.maxScoreDelta <= maxScoreDeltaThreshold
          ? "변형 질문 간 최고 점수 변동이 허용 범위 안입니다."
          : "일부 변형 질문에서 최고 점수가 크게 흔들립니다. 검색어 별칭 또는 청크 구조를 보강해야 합니다."
    },
    {
      id: "permission_boundary",
      label: "권한 경계 재검사",
      status: input.permissionDeniedTotal > 0 ? "warn" : "pass",
      metric: input.permissionDeniedTotal,
      threshold: 0,
      message:
        input.permissionDeniedTotal > 0
          ? `${input.permissionDeniedTotal}개 후보가 변형 검색 중 권한 경계에서 차단됐습니다. 답변 후보에는 허용 출처만 포함됩니다.`
          : "변형 검색 전체에서 권한 차단 후보 없이 허용 출처만 검색됐습니다."
    }
  ];
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function latencyStatus(value: number, budgetMs: number): "pass" | "warn" | "fail" {
  if (value <= budgetMs) {
    return "pass";
  }
  return value <= budgetMs * 2 ? "warn" : "fail";
}

function formatPermissionEnforcementForProfile(enforcement: PermissionBoundaryAudit["enforcement"]): string {
  const labels: Record<PermissionBoundaryAudit["enforcement"], string> = {
    pre_ranking_sql_filter: "검색 전 SQL 권한 필터",
    postgres_recheck_after_elasticsearch: "Elasticsearch 후보 PostgreSQL 재검사"
  };
  return labels[enforcement];
}

function formatRetrievalDiagnosticsStatus(status: RetrievalDiagnostics["status"]): string {
  const labels: Record<RetrievalDiagnostics["status"], string> = {
    ready: "자동 답변 가능",
    review: "검토 권고",
    blocked: "근거 보강 필요"
  };
  return labels[status];
}

function formatRecommendedActionForProfile(action: RetrievalDiagnostics["recommendedAction"]): string {
  const labels: Record<RetrievalDiagnostics["recommendedAction"], string> = {
    answer: "자동 답변",
    answer_with_context_review: "컨텍스트 확인 후 답변",
    human_review: "담당자 검토",
    clarify_or_expand_sources: "질문 보강 또는 문서 추가"
  };
  return labels[action];
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

async function calculateAnswerDocumentAgreement(answer: string, sourceContents: string[]): Promise<DocumentAgreement> {
  if (process.env.DOCUMENT_AGREEMENT_METHOD === "semantic_embedding") {
    return calculateSemanticDocumentAgreement(answer, sourceContents, createEmbeddingProviderFromEnv());
  }

  return calculateDocumentAgreement(answer, sourceContents);
}

type AgenticToolState = {
  sources: SearchResult[];
  permissionAudit: PermissionBoundaryAudit;
  checklist: RunbookChecklist | null;
  sensitiveAction: boolean;
  approvalRequested: boolean;
  toolCalls: Array<{ toolName: string; status: ToolCallStatus }>;
};

type SqlConnection = { execute<T = unknown>(query: string, params?: unknown[]): Promise<T> };

type DocumentInventoryToolRow = {
  documentId: string;
  chunkId: string;
  title: string;
  path: string;
  visibility: string;
  teamSlug?: string | null;
  chunkCount: number | string;
  latestVersion: number | string;
  updatedAt: string;
};

const AGENTIC_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_documents",
    description: "Search permission-filtered operation documents before answering.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query derived from the user question." },
        limit: { type: "number", description: "Maximum number of source chunks to return." }
      },
      required: ["query"]
    }
  },
  {
    name: "list_documents",
    description: "List currently indexed documents the actor is allowed to access. Use this for inventory questions such as what documents exist.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of documents to return." }
      }
    }
  },
  {
    name: "create_runbook_checklist",
    description: "Create an incident response checklist from already searched runbook sources.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Incident or runbook question to turn into checklist items." }
      },
      required: ["question"]
    }
  },
  {
    name: "request_human_approval",
    description: "Route sensitive production actions to a human approval queue instead of executing them.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Sensitive action name." },
        reason: { type: "string", description: "Why human approval is required." }
      },
      required: ["action"]
    }
  }
];

async function logToolCall(
  connection: { execute<T = unknown>(query: string, params?: unknown[]): Promise<T> },
  questionId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  status: ToolCallStatus
): Promise<void> {
  await connection.execute(
    `
      insert into tool_call_logs (question_id, tool_name, input, output, status)
      values (?::uuid, ?, ?::jsonb, ?::jsonb, ?);
    `,
    [questionId, toolName, JSON.stringify(input), JSON.stringify(output), status]
  );
}

function emptyPermissionAudit(context: RequestContext): PermissionBoundaryAudit {
  return {
    enforcement: "pre_ranking_sql_filter",
    candidateWindow: 0,
    allowedCandidateCount: 0,
    deniedCandidateCount: 0,
    deniedByVisibility: {},
    actor: {
      roles: context.roles,
      teamSlugs: context.teamSlugs
    }
  };
}

export function isDocumentInventoryQuestion(question: string): boolean {
  const compact = question.toLowerCase().replace(/\s+/g, "");
  return (
    /(?:지금|현재|등록된|색인된|저장된|가지고있는|보유한)?(?:무슨|어떤|뭐|무엇).{0,12}문서.{0,12}(?:있|목록|리스트|보여|알려)/.test(compact) ||
    /문서.{0,12}(?:목록|리스트|뭐|무엇|어떤|몇개|몇개야|보여|알려)/.test(compact) ||
    /(?:what|which|list|show).{0,20}(?:documents|docs|knowledgebase)/i.test(question)
  );
}

function formatDocumentInventoryAnswer(sources: SearchResult[]): string {
  if (sources.length === 0) {
    return "현재 접근 권한으로 확인할 수 있는 문서가 없습니다.";
  }

  const lines = sources.map((source, index) => {
    const chunkCount = readMetadataNumber(source.metadata.chunkCount);
    const latestVersion = readMetadataNumber(source.metadata.latestVersion);
    const team = source.teamSlug ? `, 팀 ${source.teamSlug}` : "";
    return `${index + 1}. ${source.title} (${source.path})\n   - ${formatDocumentVisibility(source.visibility)}${team}, 청크 ${chunkCount}개, 버전 ${latestVersion}`;
  });

  return [`현재 접근 가능한 문서는 ${sources.length}개입니다.`, "", ...lines].join("\n");
}

function formatDocumentVisibility(visibility: string): string {
  if (visibility === "public") {
    return "공개 문서";
  }
  if (visibility === "team") {
    return "팀 한정 문서";
  }
  if (visibility === "restricted") {
    return "제한 문서";
  }
  return `${visibility} 문서`;
}

function readMetadataNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 10)) : fallback;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
