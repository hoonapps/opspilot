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

export type AnswerQualityGate = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "pass" | "review" | "block";
  score: number;
  decision: {
    label: string;
    recommendedAction: "share" | "review_before_share" | "block_and_rework";
    reasons: string[];
  };
  thresholds: {
    minConfidence: number;
    minDocumentAgreement: number;
    minGroundingCoverage: number;
    minSourceOverlap: number;
  };
  summary: {
    proofStatus: AnswerProof["status"];
    replayStatus: AnswerReplay["status"];
    needsHumanReview: boolean;
    approvalStatus: "not_required" | "approved" | "pending" | "rejected" | "missing";
    positiveFeedbackCount: number;
    negativeFeedbackCount: number;
    confidence: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceOverlapRatio: number;
    sourceAccessRechecked: true;
  };
  checks: Array<{
    id:
      | "proof_verified"
      | "replay_stable"
      | "approval_resolved"
      | "feedback_signal"
      | "confidence_floor"
      | "document_agreement"
      | "grounding_coverage"
      | "source_overlap"
      | "permission_boundary";
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  evidenceLinks: {
    trace: string;
    proof: string;
    replay: string;
    evidenceBundle: string;
  };
};

export type AnswerClaimSupport = {
  schemaVersion: "opspilot.answer_claim_support.v1";
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "supported" | "review_required" | "unsupported";
  thresholds: {
    minSupportedClaimScore: number;
    minPartialClaimScore: number;
  };
  summary: {
    claimCount: number;
    supportedClaimCount: number;
    partialClaimCount: number;
    unsupportedClaimCount: number;
    averageSupportScore: number;
    minSupportScore: number;
    sourceCoverageCount: number;
    sourceAccessRechecked: true;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
  claims: Array<{
    rank: number;
    text: string;
    status: "supported" | "partial" | "unsupported";
    supportScore: number;
    matchedTokenCount: number;
    tokenCount: number;
    recommendedAction: "share" | "review_claim" | "rewrite_with_sources";
    evidence: Array<{
      sourceRank: number;
      path: string;
      title: string;
      snippet: string;
      supportScore: number;
      matchedTokenCount: number;
      matchedTokens: string[];
    }>;
  }>;
};

export type AnswerLineageGraph = {
  schemaVersion: "opspilot.answer_lineage_graph.v1";
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "verified" | "review_required" | "incomplete";
  summary: {
    nodeCount: number;
    edgeCount: number;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    restrictedSourceCount: number;
    pendingApprovalCount: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceAccessRechecked: true;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
  nodes: AnswerLineageNode[];
  edges: AnswerLineageEdge[];
};

export type AnswerLineageNode = {
  id: string;
  kind: "question" | "answer" | "source" | "tool" | "approval" | "feedback" | "gate";
  label: string;
  status: string;
  occurredAt?: string;
  detail: Record<string, unknown>;
};

export type AnswerLineageEdge = {
  from: string;
  to: string;
  label: string;
  kind: "created" | "grounded_by" | "called" | "requires" | "rated" | "checks";
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

  async getClaimSupport(answerId: string, context: RequestContext): Promise<AnswerClaimSupport> {
    const trace = await this.getTrace(answerId, context);
    const thresholds = {
      minSupportedClaimScore: readProofThreshold("CLAIM_SUPPORT_MIN_SUPPORTED", 0.35),
      minPartialClaimScore: readProofThreshold("CLAIM_SUPPORT_MIN_PARTIAL", 0.18)
    };
    const claims = buildClaimSupportClaims(trace, thresholds);
    const supportedClaimCount = claims.filter((claim) => claim.status === "supported").length;
    const partialClaimCount = claims.filter((claim) => claim.status === "partial").length;
    const unsupportedClaimCount = claims.filter((claim) => claim.status === "unsupported").length;
    const supportScores = claims.map((claim) => claim.supportScore);
    const sourceCoverageCount = new Set(claims.flatMap((claim) => claim.evidence.map((item) => item.path))).size;
    const unsigned = {
      schemaVersion: "opspilot.answer_claim_support.v1" as const,
      answerId: trace.answer.id,
      questionId: trace.answer.questionId,
      generatedAt: new Date().toISOString(),
      status:
        unsupportedClaimCount > 0
          ? ("unsupported" as const)
          : partialClaimCount > 0
            ? ("review_required" as const)
            : ("supported" as const),
      thresholds,
      summary: {
        claimCount: claims.length,
        supportedClaimCount,
        partialClaimCount,
        unsupportedClaimCount,
        averageSupportScore: ratio(
          supportScores.reduce((total, score) => total + score, 0),
          Math.max(supportScores.length, 1)
        ),
        minSupportScore: supportScores.length > 0 ? Number(Math.min(...supportScores).toFixed(3)) : 0,
        sourceCoverageCount,
        sourceAccessRechecked: true as const
      },
      claims
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

  async getLineageGraph(answerId: string, context: RequestContext): Promise<AnswerLineageGraph> {
    const trace = await this.getTrace(answerId, context);
    const graph = buildLineageGraph(trace);
    const unsigned = {
      schemaVersion: "opspilot.answer_lineage_graph.v1" as const,
      answerId: trace.answer.id,
      questionId: trace.answer.questionId,
      generatedAt: new Date().toISOString(),
      status: graph.status,
      summary: graph.summary,
      nodes: graph.nodes,
      edges: graph.edges
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

  async getQualityGate(answerId: string, context: RequestContext): Promise<AnswerQualityGate> {
    const bundle = await this.getEvidenceBundle(answerId, context);
    const thresholds = {
      minConfidence: readProofThreshold("QUALITY_GATE_MIN_CONFIDENCE", Number(process.env.CONFIDENCE_THRESHOLD ?? 0.3)),
      minDocumentAgreement: bundle.artifacts.proof.thresholds.minDocumentAgreement,
      minGroundingCoverage: bundle.artifacts.proof.thresholds.minGroundingCoverage,
      minSourceOverlap: readProofThreshold("REPLAY_MIN_SOURCE_OVERLAP", 0.6)
    };
    const approvalStatus = summarizeApprovalStatus(bundle.artifacts.trace);
    const checks = buildQualityGateChecks({ bundle, thresholds, approvalStatus });
    const status = qualityGateStatus(checks);
    const reasons = checks
      .filter((check) => check.status !== "pass")
      .map((check) => `${check.label}: ${check.evidence}`);

    return {
      answerId: bundle.answerId,
      questionId: bundle.questionId,
      generatedAt: new Date().toISOString(),
      status,
      score: ratio(checks.filter((check) => check.status === "pass").length, checks.length),
      decision: {
        label: qualityGateLabel(status),
        recommendedAction:
          status === "pass" ? "share" : status === "review" ? "review_before_share" : "block_and_rework",
        reasons
      },
      thresholds,
      summary: {
        proofStatus: bundle.summary.proofStatus,
        replayStatus: bundle.summary.replayStatus,
        needsHumanReview: bundle.summary.needsHumanReview,
        approvalStatus,
        positiveFeedbackCount: bundle.artifacts.trace.feedback.filter((item) => item.rating > 0).length,
        negativeFeedbackCount: bundle.artifacts.trace.feedback.filter((item) => item.rating < 0).length,
        confidence: bundle.artifacts.trace.summary.confidence,
        documentAgreementScore: bundle.summary.documentAgreementScore,
        groundingCoverageRatio: bundle.summary.groundingCoverageRatio,
        sourceOverlapRatio: bundle.summary.sourceOverlapRatio,
        sourceAccessRechecked: bundle.actorBoundary.sourceAccessRechecked
      },
      checks,
      evidenceLinks: {
        trace: `/answers/${bundle.answerId}/trace`,
        proof: `/answers/${bundle.answerId}/proof`,
        replay: `/answers/${bundle.answerId}/replay`,
        evidenceBundle: `/answers/${bundle.answerId}/evidence-bundle`
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

function buildClaimSupportClaims(
  trace: AnswerTrace,
  thresholds: AnswerClaimSupport["thresholds"]
): AnswerClaimSupport["claims"] {
  const evidenceUnits = buildClaimEvidenceUnits(trace);
  return splitAnswerClaims(trace.answer.text).map((claimText, index) => {
    const claimTokens = [...new Set(tokenizeForAgreement(removeAgreementBoilerplate(claimText)))];
    const evidence = evidenceUnits
      .map((unit) => {
        const matchedTokens = claimTokens.filter((token) => unit.tokens.has(token));
        return {
          sourceRank: unit.sourceRank,
          path: unit.path,
          title: unit.title,
          snippet: unit.snippet,
          supportScore: ratio(matchedTokens.length, claimTokens.length),
          matchedTokenCount: matchedTokens.length,
          matchedTokens: matchedTokens.slice(0, 12)
        };
      })
      .filter((unit) => unit.matchedTokens.length > 0)
      .sort(
        (a, b) =>
          b.supportScore - a.supportScore ||
          b.matchedTokens.length - a.matchedTokens.length ||
          a.sourceRank - b.sourceRank
      )
      .slice(0, 3);
    const supportScore = evidence[0]?.supportScore ?? 0;
    const matchedTokenCount = evidence[0]?.matchedTokenCount ?? 0;
    const status =
      supportScore >= thresholds.minSupportedClaimScore
        ? ("supported" as const)
        : supportScore >= thresholds.minPartialClaimScore
          ? ("partial" as const)
          : ("unsupported" as const);

    return {
      rank: index + 1,
      text: claimText,
      status,
      supportScore,
      matchedTokenCount,
      tokenCount: claimTokens.length,
      recommendedAction:
        status === "supported" ? ("share" as const) : status === "partial" ? ("review_claim" as const) : ("rewrite_with_sources" as const),
      evidence
    };
  });
}

function buildClaimEvidenceUnits(trace: AnswerTrace): Array<{
  sourceRank: number;
  path: string;
  title: string;
  snippet: string;
  tokens: Set<string>;
}> {
  const sourceByPath = new Map(trace.sources.map((source) => [source.path, source]));
  return trace.grounding.sources.flatMap((source) => {
    const fallback = sourceByPath.get(source.path)?.contentPreview;
    const snippets = source.evidenceSnippets.length > 0 ? source.evidenceSnippets.map((snippet) => snippet.text) : fallback ? [fallback] : [];
    return snippets.map((snippet) => ({
      sourceRank: source.rank,
      path: source.path,
      title: source.title,
      snippet,
      tokens: new Set(tokenizeForAgreement(snippet))
    }));
  });
}

function splitAnswerClaims(answerText: string): string[] {
  const normalized = removeAgreementBoilerplate(answerText)
    .split(/\n+/u)
    .flatMap((line) => line.split(/(?<=[.!?。])\s+/u))
    .map((line) =>
      line
        .replace(/^\s*(?:[-*]|\d+[.)])\s*/u, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length >= 12)
    .filter((line) => tokenizeForAgreement(line).length >= 2);

  if (normalized.length > 0) {
    return normalized.slice(0, 12);
  }

  const fallback = compactEvidenceText(removeAgreementBoilerplate(answerText));
  return fallback ? [fallback] : [];
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
  const needsSensitiveApproval = reviewReasons.includes("sensitive_action");
  const contextWithinBudget = trace.contextPackage.estimatedTokenCount <= trace.contextPackage.tokenBudget;
  const evidenceSnippetCount = trace.grounding.sources.reduce((total, source) => total + source.evidenceSnippets.length, 0);

  return [
    {
      id: "source_access_rechecked",
      label: "출처 접근 권한 재검사",
      status: "pass",
      evidence: `추적 조회 시 반환 출처 ${trace.sources.length}개를 현재 호출자 권한으로 다시 확인했습니다.`
    },
    {
      id: "sources_attached",
      label: "출처 연결",
      status: trace.sources.length > 0 ? "pass" : "fail",
      evidence:
        trace.sources.length > 0
          ? `답변에 출처 ${trace.sources.length}개가 저장됐습니다.`
          : "이 답변에 저장된 출처가 없습니다."
    },
    {
      id: "document_agreement",
      label: "문서 일치율",
      status: thresholdStatus(trace.summary.documentAgreementScore, thresholds.minDocumentAgreement),
      evidence: `답변과 출처 토큰 일치율은 ${formatRatio(trace.summary.documentAgreementScore)}입니다.`,
      metric: trace.summary.documentAgreementScore,
      threshold: thresholds.minDocumentAgreement
    },
    {
      id: "grounding_coverage",
      label: "근거 커버리지",
      status: thresholdStatus(trace.grounding.coverageRatio, thresholds.minGroundingCoverage),
      evidence: `답변 토큰 ${trace.grounding.coveredAnswerTokenCount}/${trace.grounding.answerTokenCount}개가 검색된 출처와 겹칩니다.`,
      metric: trace.grounding.coverageRatio,
      threshold: thresholds.minGroundingCoverage
    },
    {
      id: "evidence_snippets",
      label: "근거 스니펫",
      status: evidenceSnippetCount > 0 ? "pass" : "fail",
      evidence:
        evidenceSnippetCount > 0
          ? `출처 스니펫 ${evidenceSnippetCount}개가 어떤 문장으로 답변을 지지하는지 설명합니다.`
          : "이 답변을 지지하는 출처 스니펫을 추출하지 못했습니다."
    },
    {
      id: "search_tool_audited",
      label: "검색 도구 감사",
      status: searchTool?.status === "allowed" ? "pass" : "fail",
      evidence: searchTool
        ? `search_documents 도구 호출이 ${searchTool.status} 상태로 저장됐습니다.`
        : "저장된 도구 호출 로그에서 search_documents를 찾지 못했습니다."
    },
    {
      id: "approval_boundary",
      label: "승인 경계",
      status: needsSensitiveApproval
        ? approvalTool && trace.approvals.length > 0
          ? "pass"
          : "fail"
        : "pass",
      evidence: needsSensitiveApproval
        ? approvalTool && trace.approvals.length > 0
          ? `민감 작업 답변이 승인 요청 ${trace.approvals.length}개를 만들었고 ${approvalTool.toolName} 도구는 ${approvalTool.status} 상태로 남았습니다.`
          : "민감 작업 답변이 필요한 승인 위임 기록을 저장하지 못했습니다."
        : "이 답변에는 민감 작업 승인 위임이 필요하지 않습니다."
    },
    {
      id: "context_budget",
      label: "컨텍스트 예산",
      status: contextWithinBudget && trace.contextPackage.includedChunkCount > 0 ? "pass" : "fail",
      evidence: `예상 컨텍스트 토큰 ${trace.contextPackage.estimatedTokenCount}/${trace.contextPackage.tokenBudget}개를 사용했습니다.`
    },
    {
      id: "feedback_captured",
      label: "피드백 저장",
      status: trace.feedback.length > 0 ? "pass" : "warn",
      evidence:
        trace.feedback.length > 0
          ? `피드백 ${trace.feedback.length}개가 답변에 연결됐습니다.`
          : "아직 연결된 검토자 피드백이 없습니다."
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
      label: "1순위 출처 안정성",
      status: summary.topSourceChanged ? "fail" : "pass",
      evidence: summary.topSourceChanged
        ? `1순위 출처가 ${summary.originalTopSourcePath ?? "없음"}에서 ${summary.currentTopSourcePath ?? "없음"}로 바뀌었습니다.`
        : `1순위 출처가 ${summary.currentTopSourcePath ?? "없음"}로 유지됩니다.`
    },
    {
      id: "source_overlap",
      label: "출처 겹침",
      status: thresholdStatus(summary.sourceOverlapRatio, minOverlap),
      evidence: `현재 검색 결과가 원래 답변 출처와 ${formatRatio(summary.sourceOverlapRatio)} 비율로 겹칩니다.`,
      metric: summary.sourceOverlapRatio,
      threshold: minOverlap
    },
    {
      id: "current_document_agreement",
      label: "현재 문서 일치율",
      status: thresholdStatus(summary.currentDocumentAgreement, minCurrentAgreement),
      evidence: `원래 답변과 현재 출처의 문서 일치율은 ${formatRatio(summary.currentDocumentAgreement)}입니다.`,
      metric: summary.currentDocumentAgreement,
      threshold: minCurrentAgreement
    },
    {
      id: "permission_boundary_replayed",
      label: "권한 경계 재실행",
      status: "pass",
      evidence: `재실행 검색에서 권한 인식 검색을 사용했고 접근 불가 후보 ${summary.permissionDeniedCandidates}개를 차단했습니다.`
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

function summarizeApprovalStatus(trace: AnswerTrace): AnswerQualityGate["summary"]["approvalStatus"] {
  const reviewReasons = readReviewReasonCodes(trace.answer.metadata.reviewReasons);
  if (!reviewReasons.includes("sensitive_action")) {
    return "not_required";
  }
  if (trace.approvals.some((approval) => approval.status === "approved")) {
    return "approved";
  }
  if (trace.approvals.some((approval) => approval.status === "pending")) {
    return "pending";
  }
  if (trace.approvals.some((approval) => approval.status === "rejected")) {
    return "rejected";
  }
  return "missing";
}

function buildQualityGateChecks(input: {
  bundle: AnswerEvidenceBundle;
  thresholds: AnswerQualityGate["thresholds"];
  approvalStatus: AnswerQualityGate["summary"]["approvalStatus"];
}): AnswerQualityGate["checks"] {
  const { bundle, thresholds, approvalStatus } = input;
  const trace = bundle.artifacts.trace;
  const positiveFeedback = trace.feedback.filter((item) => item.rating > 0).length;
  const negativeFeedback = trace.feedback.filter((item) => item.rating < 0).length;

  return [
    {
      id: "proof_verified",
      label: "증명 패킷",
      status:
        bundle.summary.proofStatus === "verified"
          ? "pass"
          : bundle.summary.proofStatus === "review_required"
            ? "warn"
            : "fail",
      evidence: `증명 상태는 ${bundle.summary.proofStatus}입니다.`
    },
    {
      id: "replay_stable",
      label: "재실행 안정성",
      status: bundle.summary.replayStatus === "stable" ? "pass" : bundle.summary.replayStatus === "needs_review" ? "warn" : "fail",
      evidence: `현재 검색 재실행 상태는 ${bundle.summary.replayStatus}입니다.`
    },
    {
      id: "approval_resolved",
      label: "승인 경계",
      status:
        approvalStatus === "not_required" || approvalStatus === "approved"
          ? "pass"
          : approvalStatus === "pending"
            ? "warn"
            : "fail",
      evidence:
        approvalStatus === "not_required"
          ? "민감 작업 승인이 필요하지 않습니다."
          : approvalStatus === "approved"
            ? "민감 작업 승인 요청이 승인됐습니다."
            : approvalStatus === "pending"
              ? "민감 작업 승인 요청이 아직 대기 중입니다."
              : approvalStatus === "rejected"
                ? "민감 작업 승인 요청이 반려됐습니다."
                : "필요한 승인 기록을 찾지 못했습니다."
    },
    {
      id: "feedback_signal",
      label: "피드백 신호",
      status: negativeFeedback > 0 ? "fail" : positiveFeedback > 0 ? "pass" : "warn",
      evidence:
        negativeFeedback > 0
          ? `개선 필요 피드백 ${negativeFeedback}개가 있습니다.`
          : positiveFeedback > 0
            ? `도움됨 피드백 ${positiveFeedback}개가 있습니다.`
            : "아직 답변 피드백이 없습니다."
    },
    {
      id: "confidence_floor",
      label: "신뢰도 하한",
      status: thresholdStatus(trace.summary.confidence, thresholds.minConfidence),
      evidence: `답변 신뢰도는 ${formatRatio(trace.summary.confidence)}입니다.`,
      metric: trace.summary.confidence,
      threshold: thresholds.minConfidence
    },
    {
      id: "document_agreement",
      label: "문서 일치율",
      status: thresholdStatus(bundle.summary.documentAgreementScore, thresholds.minDocumentAgreement),
      evidence: `답변/문서 일치율은 ${formatRatio(bundle.summary.documentAgreementScore)}입니다.`,
      metric: bundle.summary.documentAgreementScore,
      threshold: thresholds.minDocumentAgreement
    },
    {
      id: "grounding_coverage",
      label: "근거 커버리지",
      status: thresholdStatus(bundle.summary.groundingCoverageRatio, thresholds.minGroundingCoverage),
      evidence: `답변 토큰 근거 커버리지는 ${formatRatio(bundle.summary.groundingCoverageRatio)}입니다.`,
      metric: bundle.summary.groundingCoverageRatio,
      threshold: thresholds.minGroundingCoverage
    },
    {
      id: "source_overlap",
      label: "출처 겹침",
      status: thresholdStatus(bundle.summary.sourceOverlapRatio, thresholds.minSourceOverlap),
      evidence: `원래 출처와 현재 검색 출처의 겹침은 ${formatRatio(bundle.summary.sourceOverlapRatio)}입니다.`,
      metric: bundle.summary.sourceOverlapRatio,
      threshold: thresholds.minSourceOverlap
    },
    {
      id: "permission_boundary",
      label: "권한 경계",
      status: bundle.actorBoundary.sourceAccessRechecked ? "pass" : "fail",
      evidence: bundle.actorBoundary.sourceAccessRechecked
        ? "출처 접근 권한을 현재 호출자 기준으로 다시 확인했습니다."
        : "출처 접근 권한 재검사를 확인하지 못했습니다."
    }
  ];
}

function buildLineageGraph(trace: AnswerTrace): Pick<AnswerLineageGraph, "status" | "summary" | "nodes" | "edges"> {
  const questionNodeId = `question:${trace.answer.questionId}`;
  const answerNodeId = `answer:${trace.answer.id}`;
  const gateNodeId = `gate:${trace.answer.id}`;
  const nodes: AnswerLineageNode[] = [
    {
      id: questionNodeId,
      kind: "question",
      label: "질문",
      status: trace.answer.channel ?? "web",
      occurredAt: trace.timeline.find((event) => event.kind === "question")?.at ?? trace.answer.createdAt,
      detail: {
        question: trace.answer.question,
        channel: trace.answer.channel ?? "web",
        roles: Array.isArray(trace.answer.actor.roles) ? trace.answer.actor.roles : [],
        teamSlugs: Array.isArray(trace.answer.actor.teamSlugs) ? trace.answer.actor.teamSlugs : []
      }
    },
    {
      id: answerNodeId,
      kind: "answer",
      label: "답변",
      status: trace.summary.needsHumanReview ? "검토 필요" : "자동 답변",
      occurredAt: trace.answer.createdAt,
      detail: {
        confidence: trace.summary.confidence,
        documentAgreementScore: trace.summary.documentAgreementScore,
        groundingCoverageRatio: trace.grounding.coverageRatio,
        answerTokenCount: trace.summary.answerTokenCount,
        coveredAnswerTokenCount: trace.summary.coveredAnswerTokenCount
      }
    },
    {
      id: gateNodeId,
      kind: "gate",
      label: "운영 공유 게이트",
      status: lineageStatus(trace),
      occurredAt: trace.answer.createdAt,
      detail: {
        sourceAccessRechecked: true,
        pendingApprovalCount: trace.approvals.filter((approval) => approval.status === "pending").length,
        feedbackCount: trace.feedback.length,
        toolCallCount: trace.toolCalls.length
      }
    }
  ];
  const edges: AnswerLineageEdge[] = [
    { from: questionNodeId, to: answerNodeId, label: "답변 생성", kind: "created" },
    { from: answerNodeId, to: gateNodeId, label: "공유 가능성 검사", kind: "checks" }
  ];

  trace.sources.forEach((source) => {
    const sourceNodeId = `source:${source.chunkId}`;
    nodes.push({
      id: sourceNodeId,
      kind: "source",
      label: source.title,
      status: source.visibility,
      detail: {
        path: source.path,
        rank: source.rank,
        score: source.score,
        visibility: source.visibility,
        teamSlug: source.teamSlug ?? null,
        chunkIndex: source.chunkIndex
      }
    });
    edges.push({ from: questionNodeId, to: sourceNodeId, label: `검색 후보 #${source.rank}`, kind: "grounded_by" });
    edges.push({ from: sourceNodeId, to: answerNodeId, label: "답변 근거", kind: "grounded_by" });
    edges.push({ from: sourceNodeId, to: gateNodeId, label: "권한 재검사", kind: "checks" });
  });

  trace.toolCalls.forEach((toolCall) => {
    const toolNodeId = `tool:${toolCall.id}`;
    nodes.push({
      id: toolNodeId,
      kind: "tool",
      label: toolCall.toolName,
      status: toolCall.status,
      occurredAt: toolCall.createdAt,
      detail: {
        toolName: toolCall.toolName,
        status: toolCall.status,
        outputSummary: summarizeLineageToolOutput(toolCall.output)
      }
    });
    edges.push({ from: questionNodeId, to: toolNodeId, label: "도구 호출", kind: "called" });
    edges.push({ from: toolNodeId, to: gateNodeId, label: "감사 로그", kind: "checks" });
  });

  trace.approvals.forEach((approval) => {
    const approvalNodeId = `approval:${approval.id}`;
    nodes.push({
      id: approvalNodeId,
      kind: "approval",
      label: approval.action,
      status: approval.status,
      occurredAt: approval.createdAt,
      detail: {
        action: approval.action,
        reason: approval.reason
      }
    });
    edges.push({ from: answerNodeId, to: approvalNodeId, label: "사람 승인 필요", kind: "requires" });
    edges.push({ from: approvalNodeId, to: gateNodeId, label: "승인 상태 반영", kind: "checks" });
  });

  trace.feedback.forEach((feedback) => {
    const feedbackNodeId = `feedback:${feedback.id}`;
    nodes.push({
      id: feedbackNodeId,
      kind: "feedback",
      label: feedback.rating > 0 ? "도움됨" : "개선 필요",
      status: feedback.rating > 0 ? "positive" : "negative",
      occurredAt: feedback.createdAt,
      detail: {
        rating: feedback.rating,
        comment: feedback.comment ?? null
      }
    });
    edges.push({ from: answerNodeId, to: feedbackNodeId, label: "피드백", kind: "rated" });
    edges.push({ from: feedbackNodeId, to: gateNodeId, label: "품질 신호", kind: "checks" });
  });

  const summary = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sourceCount: trace.sources.length,
    toolCallCount: trace.toolCalls.length,
    approvalCount: trace.approvals.length,
    feedbackCount: trace.feedback.length,
    restrictedSourceCount: trace.sources.filter((source) => source.visibility === "restricted").length,
    pendingApprovalCount: trace.approvals.filter((approval) => approval.status === "pending").length,
    documentAgreementScore: trace.summary.documentAgreementScore,
    groundingCoverageRatio: trace.grounding.coverageRatio,
    sourceAccessRechecked: true as const
  };

  return {
    status: lineageStatus(trace),
    summary,
    nodes,
    edges
  };
}

function lineageStatus(trace: AnswerTrace): AnswerLineageGraph["status"] {
  if (trace.sources.length === 0 || trace.toolCalls.length === 0) {
    return "incomplete";
  }
  if (trace.summary.needsHumanReview || trace.approvals.some((approval) => approval.status === "pending")) {
    return "review_required";
  }
  return "verified";
}

function summarizeLineageToolOutput(output: Record<string, unknown>): string {
  if (typeof output.sourceCount === "number") {
    const permissionAudit = output.permissionAudit as { deniedCandidateCount?: unknown } | undefined;
    const denied =
      permissionAudit && typeof permissionAudit.deniedCandidateCount === "number"
        ? `, 차단 후보 ${permissionAudit.deniedCandidateCount}개`
        : "";
    return `출처 ${output.sourceCount}개${denied}`;
  }
  if (typeof output.approvalStatus === "string") {
    return `승인 상태 ${output.approvalStatus}`;
  }
  if (typeof output.itemCount === "number") {
    return `체크리스트 ${output.itemCount}개`;
  }
  return "출력 요약 없음";
}

function qualityGateStatus(checks: AnswerQualityGate["checks"]): AnswerQualityGate["status"] {
  if (checks.some((check) => check.status === "fail")) {
    return "block";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "review";
  }
  return "pass";
}

function qualityGateLabel(status: AnswerQualityGate["status"]): string {
  if (status === "pass") {
    return "공유 가능";
  }
  if (status === "review") {
    return "검토 후 공유";
  }
  return "차단 후 재작성";
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
      title: "질문 저장",
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
      title: "출처 연결",
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
      title: "답변 생성",
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
      title: "피드백 저장",
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
