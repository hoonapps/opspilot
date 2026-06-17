import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { HealthService, ReadinessReport } from "../health/health.service";

export type ObservabilitySummary = {
  generatedAt: string;
  questions: {
    total: number;
    last24h: number;
  };
  answers: {
    total: number;
    needsHumanReview: number;
    humanReviewRate: number;
    averageConfidence: number;
    averageDocumentAgreement: number;
  };
  toolCalls: {
    total: number;
    byName: Record<string, number>;
    byStatus: Record<string, number>;
  };
  approvals: {
    total: number;
    byStatus: Record<string, number>;
  };
  feedback: {
    total: number;
    averageRating: number;
    helpful: number;
    needsWork: number;
  };
  documents: {
    total: number;
    chunks: number;
  };
};

export type ObservabilitySloReport = {
  generatedAt: string;
  status: SloStatus;
  objectives: SloObjective[];
};

export type SloStatus = "ok" | "warn" | "breach";

export type SloObjective = {
  id: string;
  label: string;
  description: string;
  metric: string;
  operator: "gte" | "lte";
  target: number;
  actual: number;
  status: SloStatus;
  errorBudgetRemaining: number;
  source: "answers" | "tool_calls" | "evaluations";
  window: "all_time" | "latest_eval";
};

export type ReleaseGateStatus = "pass" | "review" | "block";

export type ReleaseGateCheckStatus = "pass" | "warn" | "fail";

export type ObservabilityReleaseGate = {
  generatedAt: string;
  status: ReleaseGateStatus;
  checks: ReleaseGateCheck[];
  summary: {
    readinessOk: boolean;
    sloStatus: SloStatus;
    latestEvalPassed: boolean;
    pendingApprovals: number;
    documents: number;
    chunks: number;
    feedback: number;
  };
};

export type ReleaseGateCheck = {
  id: string;
  label: string;
  status: ReleaseGateCheckStatus;
  evidence: string;
  owner: "platform" | "rag" | "ops" | "quality";
  metric?: number;
  threshold?: number;
};

type CountRow = { total: number | string };
type QuestionRow = { total: number | string; last24h: number | string };
type AnswerRow = {
  total: number | string;
  needs_human_review: number | string;
  average_confidence: number | string | null;
  average_document_agreement: number | string | null;
};
type FeedbackRow = {
  total: number | string;
  average_rating: number | string | null;
  helpful: number | string;
  needs_work: number | string;
};
type DocumentsRow = {
  total: number | string;
  chunks: number | string;
};
type GroupRow = { key: string; total: number | string };
type EvaluationPassRow = { passed: boolean | null };
type ToolCoverageRow = { covered: number | string; total: number | string };

@Injectable()
export class ObservabilityService {
  constructor(
    private readonly orm: MikroORM,
    private readonly healthService: HealthService
  ) {}

  async summary(): Promise<ObservabilitySummary> {
    const connection = this.orm.em.fork().getConnection();
    const [questions, answers, toolTotal, toolNames, toolStatuses, approvalTotal, approvalStatuses, feedback, documents] =
      await Promise.all([
        connection.execute<QuestionRow[]>(`
          select
            count(*)::int as total,
            count(*) filter (where created_at >= now() - interval '24 hours')::int as last24h
          from questions;
        `),
        connection.execute<AnswerRow[]>(`
          select
            count(*)::int as total,
            count(*) filter (where needs_human_review)::int as needs_human_review,
            coalesce(avg(confidence), 0)::float as average_confidence,
            coalesce(avg((metadata #>> '{documentAgreement,score}')::float), 0)::float as average_document_agreement
          from answers;
        `),
        connection.execute<CountRow[]>("select count(*)::int as total from tool_call_logs;"),
        connection.execute<GroupRow[]>(`
          select tool_name as key, count(*)::int as total
          from tool_call_logs
          group by tool_name
          order by tool_name;
        `),
        connection.execute<GroupRow[]>(`
          select status as key, count(*)::int as total
          from tool_call_logs
          group by status
          order by status;
        `),
        connection.execute<CountRow[]>("select count(*)::int as total from approval_requests;"),
        connection.execute<GroupRow[]>(`
          select status as key, count(*)::int as total
          from approval_requests
          group by status
          order by status;
        `),
        connection.execute<FeedbackRow[]>(`
          select
            count(*)::int as total,
            coalesce(avg(rating), 0)::float as average_rating,
            count(*) filter (where rating > 0)::int as helpful,
            count(*) filter (where rating < 0)::int as needs_work
          from feedback;
        `),
        connection.execute<DocumentsRow[]>(`
          select
            (select count(*)::int from documents) as total,
            (select count(*)::int from document_chunks) as chunks;
        `)
      ]);

    const answerRow = answers[0] ?? {
      total: 0,
      needs_human_review: 0,
      average_confidence: 0,
      average_document_agreement: 0
    };
    const answerTotal = toNumber(answerRow.total);
    const humanReviewCount = toNumber(answerRow.needs_human_review);

    return {
      generatedAt: new Date().toISOString(),
      questions: {
        total: toNumber(questions[0]?.total),
        last24h: toNumber(questions[0]?.last24h)
      },
      answers: {
        total: answerTotal,
        needsHumanReview: humanReviewCount,
        humanReviewRate: ratio(humanReviewCount, answerTotal),
        averageConfidence: roundMetric(answerRow.average_confidence),
        averageDocumentAgreement: roundMetric(answerRow.average_document_agreement)
      },
      toolCalls: {
        total: toNumber(toolTotal[0]?.total),
        byName: toCountMap(toolNames),
        byStatus: toCountMap(toolStatuses)
      },
      approvals: {
        total: toNumber(approvalTotal[0]?.total),
        byStatus: toCountMap(approvalStatuses)
      },
      feedback: {
        total: toNumber(feedback[0]?.total),
        averageRating: roundMetric(feedback[0]?.average_rating),
        helpful: toNumber(feedback[0]?.helpful),
        needsWork: toNumber(feedback[0]?.needs_work)
      },
      documents: {
        total: toNumber(documents[0]?.total),
        chunks: toNumber(documents[0]?.chunks)
      }
    };
  }

  async slo(): Promise<ObservabilitySloReport> {
    const connection = this.orm.em.fork().getConnection();
    const [summary, latestEvalRows, toolCoverageRows] = await Promise.all([
      this.summary(),
      connection.execute<EvaluationPassRow[]>(`
        select (details->>'passed')::boolean as passed
        from evaluation_results
        where suite_name = 'seed-ops-wiki'
        order by created_at desc
        limit 1;
      `),
      connection.execute<ToolCoverageRow[]>(`
        select
          count(distinct q.id) filter (where t.id is not null)::int as covered,
          count(distinct q.id)::int as total
        from questions q
        left join tool_call_logs t on t.question_id = q.id and t.tool_name = 'search_documents';
      `)
    ]);
    const toolCoverage = ratio(toNumber(toolCoverageRows[0]?.covered), toNumber(toolCoverageRows[0]?.total));
    const latestEvalPassed = latestEvalRows[0]?.passed === true ? 1 : 0;
    const objectives: SloObjective[] = [
      buildObjective({
        id: "answer_grounding",
        label: "Answer grounding",
        description: "Average answer/document agreement should stay above the grounding target.",
        metric: "averageDocumentAgreement",
        operator: "gte",
        target: readSloThreshold("SLO_MIN_DOCUMENT_AGREEMENT", 0.8),
        actual: summary.answers.averageDocumentAgreement,
        source: "answers",
        window: "all_time"
      }),
      buildObjective({
        id: "review_load",
        label: "Review load",
        description: "Human review rate should stay within the configured operator capacity target.",
        metric: "humanReviewRate",
        operator: "lte",
        target: readSloThreshold("SLO_MAX_HUMAN_REVIEW_RATE", 0.7),
        actual: summary.answers.humanReviewRate,
        source: "answers",
        window: "all_time"
      }),
      buildObjective({
        id: "tool_audit_coverage",
        label: "Tool audit coverage",
        description: "Questions should be covered by persisted search_documents tool calls.",
        metric: "searchDocumentsCoverage",
        operator: "gte",
        target: readSloThreshold("SLO_MIN_TOOL_AUDIT_COVERAGE", 0.95),
        actual: toolCoverage,
        source: "tool_calls",
        window: "all_time"
      }),
      buildObjective({
        id: "eval_gate",
        label: "Evaluation gate",
        description: "The latest seed evaluation must pass its configured quality gates.",
        metric: "latestEvaluationPassed",
        operator: "gte",
        target: 1,
        actual: latestEvalPassed,
        source: "evaluations",
        window: "latest_eval"
      })
    ];

    return {
      generatedAt: new Date().toISOString(),
      status: aggregateSloStatus(objectives),
      objectives
    };
  }

  async releaseGate(): Promise<ObservabilityReleaseGate> {
    const connection = this.orm.em.fork().getConnection();
    const [summary, slo, readiness, latestEvalRows] = await Promise.all([
      this.summary(),
      this.slo(),
      this.healthService.readiness(),
      connection.execute<EvaluationPassRow[]>(`
        select (details->>'passed')::boolean as passed
        from evaluation_results
        where suite_name = 'seed-ops-wiki'
        order by created_at desc
        limit 1;
      `)
    ]);
    const latestEvalPassed = latestEvalRows[0]?.passed === true;
    const pendingApprovals = summary.approvals.byStatus.pending ?? 0;
    const checks = buildReleaseGateChecks({
      summary,
      slo,
      readiness,
      latestEvalPassed,
      pendingApprovals
    });

    return {
      generatedAt: new Date().toISOString(),
      status: aggregateReleaseGateStatus(checks),
      checks,
      summary: {
        readinessOk: readiness.ok,
        sloStatus: slo.status,
        latestEvalPassed,
        pendingApprovals,
        documents: summary.documents.total,
        chunks: summary.documents.chunks,
        feedback: summary.feedback.total
      }
    };
  }
}

function buildReleaseGateChecks(input: {
  summary: ObservabilitySummary;
  slo: ObservabilitySloReport;
  readiness: ReadinessReport;
  latestEvalPassed: boolean;
  pendingApprovals: number;
}): ReleaseGateCheck[] {
  const minDocuments = readCountThreshold("RELEASE_MIN_DOCUMENTS", 5);
  const minChunks = readCountThreshold("RELEASE_MIN_CHUNKS", 8);
  const maxPendingApprovals = readCountThreshold("RELEASE_MAX_PENDING_APPROVALS", 25);
  const searchCalls = input.summary.toolCalls.byName.search_documents ?? 0;
  const approvalCalls = input.summary.toolCalls.byName.request_human_approval ?? 0;

  return [
    {
      id: "dependencies_ready",
      label: "Dependencies ready",
      status: input.readiness.ok ? "pass" : "fail",
      evidence: `PostgreSQL=${input.readiness.dependencies.postgres.status}, Redis=${input.readiness.dependencies.redis.status}, Elasticsearch=${input.readiness.dependencies.elasticsearch.status}.`,
      owner: "platform"
    },
    {
      id: "indexed_knowledge_ready",
      label: "Indexed knowledge ready",
      status:
        input.summary.documents.total >= minDocuments && input.summary.documents.chunks >= minChunks
          ? "pass"
          : "fail",
      evidence: `${input.summary.documents.total} documents and ${input.summary.documents.chunks} chunks are indexed.`,
      owner: "rag",
      metric: input.summary.documents.chunks,
      threshold: minChunks
    },
    {
      id: "latest_eval_gate",
      label: "Latest eval gate",
      status: input.latestEvalPassed ? "pass" : "fail",
      evidence: input.latestEvalPassed
        ? "Latest seed-ops-wiki evaluation passed."
        : "Latest seed-ops-wiki evaluation is missing or failing.",
      owner: "quality"
    },
    {
      id: "slo_guardrails",
      label: "SLO guardrails",
      status: input.slo.status === "ok" ? "pass" : input.slo.status === "warn" ? "warn" : "fail",
      evidence: `${input.slo.objectives.length} SLO objectives report ${input.slo.status}.`,
      owner: "quality"
    },
    {
      id: "agent_audit_trail",
      label: "Agent audit trail",
      status: searchCalls > 0 && approvalCalls > 0 ? "pass" : searchCalls > 0 ? "warn" : "fail",
      evidence: `search_documents=${searchCalls}, request_human_approval=${approvalCalls}.`,
      owner: "ops"
    },
    {
      id: "approval_backlog",
      label: "Approval backlog",
      status: input.pendingApprovals <= maxPendingApprovals ? "pass" : "warn",
      evidence: `${input.pendingApprovals} pending approvals; review threshold is ${maxPendingApprovals}.`,
      owner: "ops",
      metric: input.pendingApprovals,
      threshold: maxPendingApprovals
    },
    {
      id: "feedback_signal",
      label: "Feedback signal",
      status: input.summary.feedback.total > 0 ? "pass" : "warn",
      evidence:
        input.summary.feedback.total > 0
          ? `${input.summary.feedback.total} feedback records are available.`
          : "No feedback has been captured yet.",
      owner: "quality",
      metric: input.summary.feedback.total,
      threshold: 1
    }
  ];
}

function aggregateReleaseGateStatus(checks: ReleaseGateCheck[]): ReleaseGateStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "block";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "review";
  }
  return "pass";
}

function buildObjective(input: Omit<SloObjective, "status" | "errorBudgetRemaining">): SloObjective {
  return {
    ...input,
    actual: roundMetric(input.actual),
    status: objectiveStatus(input.actual, input.operator, input.target),
    errorBudgetRemaining: errorBudgetRemaining(input.actual, input.operator, input.target)
  };
}

function aggregateSloStatus(objectives: SloObjective[]): SloStatus {
  if (objectives.some((objective) => objective.status === "breach")) {
    return "breach";
  }
  if (objectives.some((objective) => objective.status === "warn")) {
    return "warn";
  }
  return "ok";
}

function objectiveStatus(actual: number, operator: SloObjective["operator"], target: number): SloStatus {
  if (operator === "gte") {
    if (actual >= target) {
      return "ok";
    }
    return actual >= target * 0.95 ? "warn" : "breach";
  }

  if (actual <= target) {
    return "ok";
  }
  return actual <= target * 1.1 ? "warn" : "breach";
}

function errorBudgetRemaining(actual: number, operator: SloObjective["operator"], target: number): number {
  if (operator === "gte") {
    if (target >= 1) {
      return actual >= target ? 1 : -1;
    }
    const denominator = Math.max(1 - target, 0.001);
    return clampMetric((actual - target) / denominator);
  }

  if (target <= 0) {
    return actual <= target ? 1 : -1;
  }
  const denominator = Math.max(target, 0.001);
  return clampMetric((target - actual) / denominator);
}

function readSloThreshold(name: string, fallback: number): number {
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

function readCountThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function clampMetric(value: number): number {
  return roundMetric(Math.max(-1, Math.min(value, 1)));
}

function toCountMap(rows: GroupRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.key, toNumber(row.total)]));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundMetric(numerator / denominator);
}

function roundMetric(value: number | string | null | undefined): number {
  return Number(toNumber(value).toFixed(3));
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value);
}
