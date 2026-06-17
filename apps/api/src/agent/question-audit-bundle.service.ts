import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { createHash } from "node:crypto";
import { AuthzService } from "../authz/authz.service";
import { RequestContext } from "../shared/request-context";
import { AgentToolDefinition, ToolCallAuditService } from "./tool-call-audit.service";

export type QuestionAuditBundle = {
  schemaVersion: "opspilot.question_audit_bundle.v1";
  questionId: string;
  generatedAt: string;
  actorBoundary: {
    roles: string[];
    teamSlugs: string[];
    sourceAccessRechecked: true;
  };
  question: {
    id: string;
    text: string;
    channel: string | null;
    actor: Record<string, unknown>;
    createdAt: string;
  };
  summary: {
    status: "verified" | "review_required" | "policy_violation" | "insufficient_evidence";
    answerCount: number;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    pendingApprovalCount: number;
    feedbackCount: number;
    policyCheckCount: number;
    passedPolicyCheckCount: number;
    needsHumanReview: boolean;
    documentAgreementAverage: number;
    deniedCandidateCount: number;
  };
  policyChecks: Array<{
    toolCallId: string;
    toolName: string;
    category: AgentToolDefinition["category"] | "unknown";
    sideEffect: AgentToolDefinition["sideEffect"] | "unknown";
    approvalPolicy: AgentToolDefinition["approvalPolicy"] | "unknown";
    expectedStatus: AgentToolDefinition["statusWhenCalled"] | "unknown";
    actualStatus: string;
    status: "pass" | "fail";
    evidence: string;
  }>;
  evidence: {
    answers: Array<{
      id: string;
      confidence: number;
      needsHumanReview: boolean;
      documentAgreementScore: number;
      createdAt: string;
    }>;
    sources: Array<{
      answerId: string | null;
      rank: number;
      score: number;
      documentId: string | null;
      chunkId: string | null;
      title: string;
      path: string;
      visibility: string;
      teamSlug: string | null;
      contentPreview: string | null;
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
      status: string;
      reason: Record<string, unknown>;
      createdAt: string;
    }>;
    feedback: Array<{
      id: string;
      answerId: string;
      rating: number;
      comment: string | null;
      createdAt: string;
    }>;
  };
  decisionPath: Array<{
    order: number;
    kind: "question" | "answer" | "source" | "tool" | "approval" | "feedback" | "policy";
    title: string;
    status: string;
    at: string;
    detail: Record<string, unknown>;
  }>;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
};

@Injectable()
export class QuestionAuditBundleService {
  constructor(
    private readonly orm: MikroORM,
    private readonly authz: AuthzService,
    private readonly toolCallAuditService: ToolCallAuditService
  ) {}

  async getBundle(questionId: string, context: RequestContext): Promise<QuestionAuditBundle> {
    const connection = this.orm.em.fork().getConnection();
    const [question] = (await connection.execute(
      `
        select id, text, channel, actor, created_at
        from questions
        where id = ?::uuid;
      `,
      [questionId]
    )) as QuestionRow[];

    if (!question) {
      throw new NotFoundException("Question audit bundle not found");
    }

    const [answers, persistedSources, toolCalls, approvals, feedback] = await Promise.all([
      connection.execute(
        `
          select id, confidence, needs_human_review, metadata, created_at
          from answers
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [questionId]
      ) as Promise<AnswerRow[]>,
      connection.execute(
        `
          select
            a.id as answer_id,
            s.rank,
            s.score,
            d.id as document_id,
            c.id as chunk_id,
            d.title,
            d.path,
            d.visibility,
            d.team_slug,
            left(c.content, 360) as content_preview
          from answer_sources s
          join answers a on a.id = s.answer_id
          join documents d on d.id = s.document_id
          join document_chunks c on c.id = s.chunk_id
          where a.question_id = ?::uuid
          order by a.created_at asc, s.rank asc;
        `,
        [questionId]
      ) as Promise<SourceRow[]>,
      connection.execute(
        `
          select id, tool_name, status, input, output, created_at
          from tool_call_logs
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [questionId]
      ) as Promise<ToolCallRow[]>,
      connection.execute(
        `
          select id, action, reason, status, created_at
          from approval_requests
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [questionId]
      ) as Promise<ApprovalRow[]>,
      connection.execute(
        `
          select f.id, f.answer_id, f.rating, f.comment, f.created_at
          from feedback f
          join answers a on a.id = f.answer_id
          where a.question_id = ?::uuid
          order by f.created_at asc;
        `,
        [questionId]
      ) as Promise<FeedbackRow[]>
    ]);

    const sourcePathsFromTools = readSearchSourcePaths(toolCalls);
    const toolOnlySources = await this.loadToolOnlySources(sourcePathsFromTools, persistedSources);
    const sources = [...persistedSources, ...toolOnlySources];
    const deniedSources = sources.filter((source) => !this.authz.canAccessDocument(context, source.visibility, source.team_slug));
    if (deniedSources.length > 0) {
      throw new ForbiddenException("Question audit bundle contains sources that are not accessible to this actor");
    }

    const mappedAnswers = answers.map((answer) => ({
      id: answer.id,
      confidence: answer.confidence,
      needsHumanReview: answer.needs_human_review,
      documentAgreementScore: readDocumentAgreementScore(answer.metadata),
      createdAt: toIsoString(answer.created_at)
    }));
    const mappedSources = sources.map((source) => ({
      answerId: source.answer_id,
      rank: source.rank,
      score: source.score,
      documentId: source.document_id,
      chunkId: source.chunk_id,
      title: source.title,
      path: source.path,
      visibility: source.visibility,
      teamSlug: source.team_slug,
      contentPreview: source.content_preview
    }));
    const mappedToolCalls = toolCalls.map((toolCall) => ({
      id: toolCall.id,
      toolName: toolCall.tool_name,
      status: toolCall.status,
      input: normalizeRecord(toolCall.input),
      output: normalizeRecord(toolCall.output),
      createdAt: toIsoString(toolCall.created_at)
    }));
    const mappedApprovals = approvals.map((approval) => ({
      id: approval.id,
      action: approval.action,
      status: approval.status,
      reason: normalizeRecord(approval.reason),
      createdAt: toIsoString(approval.created_at)
    }));
    const mappedFeedback = feedback.map((item) => ({
      id: item.id,
      answerId: item.answer_id,
      rating: item.rating,
      comment: item.comment,
      createdAt: toIsoString(item.created_at)
    }));
    const policyChecks = buildPolicyChecks(mappedToolCalls, this.toolCallAuditService.registry().tools);
    const status = decideStatus({
      answers: mappedAnswers,
      sources: mappedSources,
      toolCalls: mappedToolCalls,
      approvals: mappedApprovals,
      policyChecks
    });
    const unsigned = {
      schemaVersion: "opspilot.question_audit_bundle.v1" as const,
      questionId: question.id,
      generatedAt: new Date().toISOString(),
      actorBoundary: {
        roles: context.roles.slice().sort(),
        teamSlugs: context.teamSlugs.slice().sort(),
        sourceAccessRechecked: true as const
      },
      question: {
        id: question.id,
        text: question.text,
        channel: question.channel,
        actor: normalizeRecord(question.actor),
        createdAt: toIsoString(question.created_at)
      },
      summary: {
        status,
        answerCount: mappedAnswers.length,
        sourceCount: mappedSources.length,
        toolCallCount: mappedToolCalls.length,
        approvalCount: mappedApprovals.length,
        pendingApprovalCount: mappedApprovals.filter((approval) => approval.status === "pending").length,
        feedbackCount: mappedFeedback.length,
        policyCheckCount: policyChecks.length,
        passedPolicyCheckCount: policyChecks.filter((check) => check.status === "pass").length,
        needsHumanReview: mappedAnswers.some((answer) => answer.needsHumanReview) || status === "review_required",
        documentAgreementAverage: average(mappedAnswers.map((answer) => answer.documentAgreementScore)),
        deniedCandidateCount: readDeniedCandidateCount(mappedToolCalls)
      },
      policyChecks,
      evidence: {
        answers: mappedAnswers,
        sources: mappedSources,
        toolCalls: mappedToolCalls,
        approvals: mappedApprovals,
        feedback: mappedFeedback
      },
      decisionPath: buildDecisionPath({
        question,
        answers: mappedAnswers,
        sources: mappedSources,
        toolCalls: mappedToolCalls,
        approvals: mappedApprovals,
        feedback: mappedFeedback,
        policyChecks,
        status
      })
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

  private async loadToolOnlySources(paths: string[], persistedSources: SourceRow[]): Promise<SourceRow[]> {
    const persistedPaths = new Set(persistedSources.map((source) => source.path));
    const missingPaths = [...new Set(paths)].filter((path) => !persistedPaths.has(path));
    if (missingPaths.length === 0) {
      return [];
    }

    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select
          null as answer_id,
          row_number() over (order by d.path asc)::int as rank,
          0::float as score,
          d.id as document_id,
          null as chunk_id,
          d.title,
          d.path,
          d.visibility,
          d.team_slug,
          left(coalesce(c.content, ''), 360) as content_preview
        from documents d
        left join lateral (
          select content
          from document_chunks
          where document_id = d.id
          order by chunk_index asc
          limit 1
        ) c on true
        where d.path in (?);
      `,
      [missingPaths]
    )) as SourceRow[];

    const pathOrder = new Map(missingPaths.map((path, index) => [path, index]));
    return rows
      .sort((a, b) => (pathOrder.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (pathOrder.get(b.path) ?? Number.MAX_SAFE_INTEGER))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }
}

type QuestionRow = {
  id: string;
  text: string;
  channel: string | null;
  actor: Record<string, unknown>;
  created_at: Date | string;
};

type AnswerRow = {
  id: string;
  confidence: number;
  needs_human_review: boolean;
  metadata: Record<string, unknown>;
  created_at: Date | string;
};

type SourceRow = {
  answer_id: string | null;
  rank: number;
  score: number;
  document_id: string | null;
  chunk_id: string | null;
  title: string;
  path: string;
  visibility: string;
  team_slug: string | null;
  content_preview: string | null;
};

type ToolCallRow = {
  id: string;
  tool_name: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  created_at: Date | string;
};

type ApprovalRow = {
  id: string;
  action: string;
  reason: Record<string, unknown>;
  status: string;
  created_at: Date | string;
};

type FeedbackRow = {
  id: string;
  answer_id: string;
  rating: number;
  comment: string | null;
  created_at: Date | string;
};

function buildPolicyChecks(
  toolCalls: QuestionAuditBundle["evidence"]["toolCalls"],
  registry: AgentToolDefinition[]
): QuestionAuditBundle["policyChecks"] {
  const registryByName = new Map(registry.map((tool) => [tool.name, tool]));
  return toolCalls.map((toolCall) => {
    const definition = registryByName.get(toolCall.toolName);
    const statusMatches = definition ? toolCall.status === definition.statusWhenCalled : false;
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.toolName,
      category: definition?.category ?? "unknown",
      sideEffect: definition?.sideEffect ?? "unknown",
      approvalPolicy: definition?.approvalPolicy ?? "unknown",
      expectedStatus: definition?.statusWhenCalled ?? "unknown",
      actualStatus: toolCall.status,
      status: statusMatches ? "pass" : "fail",
      evidence: definition
        ? `${toolCall.toolName} 호출 상태는 ${toolCall.status}이고 정책상 기대 상태는 ${definition.statusWhenCalled}입니다.`
        : `${toolCall.toolName} 도구가 레지스트리에 없습니다.`
    };
  });
}

function decideStatus(input: {
  answers: QuestionAuditBundle["evidence"]["answers"];
  sources: QuestionAuditBundle["evidence"]["sources"];
  toolCalls: QuestionAuditBundle["evidence"]["toolCalls"];
  approvals: QuestionAuditBundle["evidence"]["approvals"];
  policyChecks: QuestionAuditBundle["policyChecks"];
}): QuestionAuditBundle["summary"]["status"] {
  if (input.policyChecks.some((check) => check.status === "fail")) {
    return "policy_violation";
  }
  if (input.sources.length === 0 || input.toolCalls.length === 0) {
    return "insufficient_evidence";
  }
  if (
    input.answers.some((answer) => answer.needsHumanReview) ||
    input.approvals.some((approval) => approval.status === "pending") ||
    input.toolCalls.some((toolCall) => readString(toolCall.output.status) === "needs_review")
  ) {
    return "review_required";
  }
  return "verified";
}

function buildDecisionPath(input: {
  question: QuestionRow;
  answers: QuestionAuditBundle["evidence"]["answers"];
  sources: QuestionAuditBundle["evidence"]["sources"];
  toolCalls: QuestionAuditBundle["evidence"]["toolCalls"];
  approvals: QuestionAuditBundle["evidence"]["approvals"];
  feedback: QuestionAuditBundle["evidence"]["feedback"];
  policyChecks: QuestionAuditBundle["policyChecks"];
  status: QuestionAuditBundle["summary"]["status"];
}): QuestionAuditBundle["decisionPath"] {
  const questionCreatedAt = toIsoString(input.question.created_at);
  const events: QuestionAuditBundle["decisionPath"] = [
    {
      order: 1,
      kind: "question",
      title: "질문 저장",
      status: "created",
      at: questionCreatedAt,
      detail: { questionId: input.question.id, channel: input.question.channel }
    },
    ...input.toolCalls.map((toolCall) => ({
      order: 1,
      kind: "tool" as const,
      title: toolCall.toolName,
      status: toolCall.status,
      at: toolCall.createdAt,
      detail: { input: toolCall.input, output: toolCall.output }
    })),
    ...input.answers.map((answer) => ({
      order: 1,
      kind: "answer" as const,
      title: "답변 저장",
      status: answer.needsHumanReview ? "review_required" : "answered",
      at: answer.createdAt,
      detail: { answerId: answer.id, confidence: answer.confidence, documentAgreementScore: answer.documentAgreementScore }
    })),
    ...input.sources.map((source, index) => ({
      order: 1,
      kind: "source" as const,
      title: source.path,
      status: "attached",
      at: questionCreatedAt,
      detail: { rank: source.rank || index + 1, answerId: source.answerId, visibility: source.visibility, score: source.score }
    })),
    ...input.approvals.map((approval) => ({
      order: 1,
      kind: "approval" as const,
      title: approval.action,
      status: approval.status,
      at: approval.createdAt,
      detail: { reason: approval.reason }
    })),
    ...input.feedback.map((item) => ({
      order: 1,
      kind: "feedback" as const,
      title: "피드백 저장",
      status: item.rating > 0 ? "helpful" : "needs_work",
      at: item.createdAt,
      detail: { answerId: item.answerId, rating: item.rating, comment: item.comment }
    })),
    {
      order: 1,
      kind: "policy",
      title: "도구 정책 검사",
      status: input.status,
      at: new Date().toISOString(),
      detail: {
        passed: input.policyChecks.filter((check) => check.status === "pass").length,
        total: input.policyChecks.length
      }
    }
  ];

  return events
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .map((event, index) => ({ ...event, order: index + 1 }));
}

function readSearchSourcePaths(toolCalls: ToolCallRow[]): string[] {
  return toolCalls.flatMap((toolCall) => {
    if (toolCall.tool_name !== "search_documents") {
      return [];
    }
    const output = normalizeRecord(toolCall.output);
    const paths = output.paths;
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [];
  });
}

function readDeniedCandidateCount(toolCalls: QuestionAuditBundle["evidence"]["toolCalls"]): number {
  return toolCalls.reduce((sum, toolCall) => {
    const permissionAudit = toolCall.output.permissionAudit;
    if (!permissionAudit || typeof permissionAudit !== "object") {
      return sum;
    }
    const deniedCandidateCount = (permissionAudit as { deniedCandidateCount?: unknown }).deniedCandidateCount;
    return sum + (typeof deniedCandidateCount === "number" ? deniedCandidateCount : 0);
  }, 0);
}

function readDocumentAgreementScore(metadata: Record<string, unknown>): number {
  const documentAgreement = metadata.documentAgreement;
  if (!documentAgreement || typeof documentAgreement !== "object") {
    return 0;
  }
  const score = (documentAgreement as { score?: unknown }).score;
  return typeof score === "number" ? score : 0;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
