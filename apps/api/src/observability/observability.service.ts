import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { HealthService, ReadinessReport } from "../health/health.service";
import { sha256 } from "../shared/hash";

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
  apiRequests: {
    total: number;
    last24h: number;
    successRate: number;
    errorRate: number;
    p95DurationMs: number;
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
  source: "answers" | "tool_calls" | "evaluations" | "api_requests";
  window: "all_time" | "latest_eval" | "last_24h";
};

export type ApiRequestObservabilityReport = {
  generatedAt: string;
  window: "last_24h";
  summary: {
    total: number;
    successRate: number;
    errorRate: number;
    p50DurationMs: number;
    p95DurationMs: number;
  };
  byEndpoint: Array<{
    method: string;
    route: string;
    total: number;
    successRate: number;
    errorRate: number;
    p50DurationMs: number;
    p95DurationMs: number;
    lastSeenAt: string;
  }>;
  recent: Array<{
    id: string;
    method: string;
    route: string;
    path: string;
    statusCode: number;
    durationMs: number;
    actorHash?: string | null;
    roles: string[];
    teamSlugs: string[];
    errorName?: string | null;
    createdAt: string;
  }>;
};

export type ErrorBudgetReport = {
  schemaVersion: "opspilot.error_budget.v1";
  generatedAt: string;
  status: "healthy" | "watch" | "page" | "freeze";
  objective: {
    availabilityTarget: number;
    allowedErrorRate: number;
    window: "rolling_24h";
    minimumRequestVolume: number;
  };
  summary: {
    totalRequests: number;
    totalErrors: number;
    availability: number;
    errorRate: number;
    errorBudgetRemaining: number;
    worstBurnRate: number;
    releaseRecommendation: "ship" | "watch" | "freeze";
  };
  windows: ErrorBudgetWindow[];
  topOffenders: ErrorBudgetEndpoint[];
  actions: ErrorBudgetAction[];
};

export type ErrorBudgetWindow = {
  id: "5m" | "1h" | "24h";
  label: string;
  durationMinutes: number;
  requestCount: number;
  errorCount: number;
  availability: number;
  errorRate: number;
  allowedErrorRate: number;
  burnRate: number;
  errorBudgetRemaining: number;
  status: "healthy" | "watch" | "page" | "freeze";
};

export type ErrorBudgetEndpoint = {
  method: string;
  route: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p95DurationMs: number;
  lastSeenAt: string;
};

export type ErrorBudgetAction = {
  priority: "p0" | "p1" | "p2";
  owner: "platform" | "ops" | "quality";
  title: string;
  reason: string;
  verification: string[];
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
    knowledgeFreshness: KnowledgeFreshness;
  };
};

export type KnowledgeFreshness = {
  latestEvalCreatedAt: string | null;
  latestDocumentUpdatedAt: string | null;
  changedDocumentsSinceEval: number;
  stale: boolean;
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

export type OperationalActionPlan = {
  schemaVersion: "opspilot.operational_action_plan.v1";
  generatedAt: string;
  status: ReleaseGateStatus;
  summary: {
    actionCount: number;
    p0: number;
    p1: number;
    p2: number;
    owners: Array<ReleaseGateCheck["owner"]>;
    releaseRecommendation: "ship" | "ship_after_review" | "hold";
  };
  actions: OperationalAction[];
};

export type OperationalAction = {
  id: string;
  title: string;
  priority: "p0" | "p1" | "p2";
  owner: ReleaseGateCheck["owner"];
  status: "open" | "watch";
  source: "release_gate" | "slo" | "operational_watch";
  sourceId: string;
  reason: string;
  impact: string;
  actionItems: string[];
  verification: string[];
  links: Array<{
    label: string;
    href: string;
  }>;
};

export type PortfolioReadinessReport = {
  schemaVersion: "opspilot.portfolio_readiness.v1";
  generatedAt: string;
  status: ReleaseGateStatus;
  score: number;
  headline: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    evidenceCount: number;
    actionCount: number;
    releaseRecommendation: OperationalActionPlan["summary"]["releaseRecommendation"];
    documents: number;
    chunks: number;
    averageDocumentAgreement: number;
    apiSuccessRate: number;
  };
  pillars: PortfolioReadinessPillar[];
  demoPath: PortfolioDemoStep[];
};

export type PortfolioReadinessPillar = {
  id: "rag_grounding" | "permission_boundary" | "tool_audit" | "operational_reliability" | "demo_artifacts";
  label: string;
  status: ReleaseGateCheckStatus;
  score: number;
  evidence: string;
  whyItMatters: string;
  demoScript: string;
  verification: string[];
  links: Array<{
    label: string;
    href: string;
  }>;
};

export type PortfolioDemoStep = {
  step: number;
  screen: string;
  action: string;
  proof: string;
};

export type AuditLedgerReport = {
  schemaVersion: "opspilot.audit_ledger.v1";
  generatedAt: string;
  algorithm: "sha256";
  canonicalization: "stable_json_v1";
  verified: boolean;
  rootHash: string;
  window: {
    limit: number;
    eventCount: number;
    firstEventAt: string | null;
    lastEventAt: string | null;
  };
  summary: {
    byType: Record<AuditLedgerEventType, number>;
    byStatus: Record<string, number>;
    questionLinkedEvents: number;
    tamperEvident: boolean;
  };
  events: AuditLedgerEvent[];
};

export type AuditLedgerEventType = "question" | "answer" | "tool_call" | "approval" | "feedback";

export type AuditLedgerEvent = {
  sequence: number;
  id: string;
  type: AuditLedgerEventType;
  questionId: string | null;
  status: string;
  createdAt: string;
  payload: Record<string, unknown>;
  previousHash: string;
  eventHash: string;
  chainHash: string;
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
type EvaluationPassRow = { passed: boolean | null; created_at?: Date | string | null };
type ToolCoverageRow = { covered: number | string; total: number | string };
type KnowledgeFreshnessRow = {
  latest_eval_created_at: Date | string | null;
  latest_document_updated_at: Date | string | null;
  changed_documents_since_eval: number | string;
};
type ApiRequestSummaryRow = {
  total: number | string;
  last24h?: number | string;
  ok: number | string;
  errors: number | string;
  p50_duration_ms: number | string | null;
  p95_duration_ms: number | string | null;
};
type ApiEndpointRow = {
  method: string;
  route: string;
  total: number | string;
  ok: number | string;
  errors: number | string;
  p50_duration_ms: number | string | null;
  p95_duration_ms: number | string | null;
  last_seen_at: Date | string;
};
type ApiRequestRecentRow = {
  id: string;
  method: string;
  route: string;
  path: string;
  status_code: number | string;
  duration_ms: number | string;
  actor_hash: string | null;
  roles: string[] | null;
  team_slugs: string[] | null;
  error_name: string | null;
  created_at: Date | string;
};
type ErrorBudgetWindowRow = {
  window_id: ErrorBudgetWindow["id"];
  request_count: number | string;
  error_count: number | string;
  p95_duration_ms: number | string | null;
};
type AuditLedgerRow = {
  id: string;
  event_type: AuditLedgerEventType;
  question_id: string | null;
  status: string;
  created_at: Date | string;
  payload: Record<string, unknown>;
};

@Injectable()
export class ObservabilityService {
  constructor(
    private readonly orm: MikroORM,
    private readonly healthService: HealthService
  ) {}

  async summary(): Promise<ObservabilitySummary> {
    const connection = this.orm.em.fork().getConnection();
    const [
      questions,
      answers,
      toolTotal,
      toolNames,
      toolStatuses,
      approvalTotal,
      approvalStatuses,
      feedback,
      documents,
      apiRequests
    ] = await Promise.all([
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
        `),
        connection.execute<ApiRequestSummaryRow[]>(`
          select
            count(*)::int as total,
            count(*) filter (where created_at >= now() - interval '24 hours')::int as last24h,
            count(*) filter (where status_code < 500)::int as ok,
            count(*) filter (where status_code >= 400)::int as errors,
            coalesce(percentile_cont(0.50) within group (order by duration_ms), 0)::float as p50_duration_ms,
            coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)::float as p95_duration_ms
          from api_request_logs;
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
      },
      apiRequests: {
        total: toNumber(apiRequests[0]?.total),
        last24h: toNumber(apiRequests[0]?.last24h),
        successRate: ratioOrOne(toNumber(apiRequests[0]?.ok), toNumber(apiRequests[0]?.total)),
        errorRate: ratio(toNumber(apiRequests[0]?.errors), toNumber(apiRequests[0]?.total)),
        p95DurationMs: Math.round(toNumber(apiRequests[0]?.p95_duration_ms))
      }
    };
  }

  async apiRequests(): Promise<ApiRequestObservabilityReport> {
    const connection = this.orm.em.fork().getConnection();
    const [summaryRows, endpointRows, recentRows] = await Promise.all([
      connection.execute<ApiRequestSummaryRow[]>(`
        select
          count(*)::int as total,
          count(*) filter (where status_code < 500)::int as ok,
          count(*) filter (where status_code >= 400)::int as errors,
          coalesce(percentile_cont(0.50) within group (order by duration_ms), 0)::float as p50_duration_ms,
          coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)::float as p95_duration_ms
        from api_request_logs
        where created_at >= now() - interval '24 hours';
      `),
      connection.execute<ApiEndpointRow[]>(`
        select
          method,
          route,
          count(*)::int as total,
          count(*) filter (where status_code < 500)::int as ok,
          count(*) filter (where status_code >= 400)::int as errors,
          coalesce(percentile_cont(0.50) within group (order by duration_ms), 0)::float as p50_duration_ms,
          coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)::float as p95_duration_ms,
          max(created_at) as last_seen_at
        from api_request_logs
        where created_at >= now() - interval '24 hours'
        group by method, route
        order by total desc, p95_duration_ms desc, method, route
        limit 12;
      `),
      connection.execute<ApiRequestRecentRow[]>(`
        select
          id::text,
          method,
          route,
          path,
          status_code,
          duration_ms,
          actor_hash,
          roles,
          team_slugs,
          error_name,
          created_at
        from api_request_logs
        order by created_at desc
        limit 12;
      `)
    ]);
    const summary = summaryRows[0] ?? {
      total: 0,
      ok: 0,
      errors: 0,
      p50_duration_ms: 0,
      p95_duration_ms: 0
    };
    const summaryTotal = toNumber(summary.total);

    return {
      generatedAt: new Date().toISOString(),
      window: "last_24h",
      summary: {
        total: summaryTotal,
        successRate: ratioOrOne(toNumber(summary.ok), summaryTotal),
        errorRate: ratio(toNumber(summary.errors), summaryTotal),
        p50DurationMs: Math.round(toNumber(summary.p50_duration_ms)),
        p95DurationMs: Math.round(toNumber(summary.p95_duration_ms))
      },
      byEndpoint: (endpointRows as ApiEndpointRow[]).map((row) => {
        const total = toNumber(row.total);
        return {
          method: row.method,
          route: row.route,
          total,
          successRate: ratioOrOne(toNumber(row.ok), total),
          errorRate: ratio(toNumber(row.errors), total),
          p50DurationMs: Math.round(toNumber(row.p50_duration_ms)),
          p95DurationMs: Math.round(toNumber(row.p95_duration_ms)),
          lastSeenAt: toIsoString(row.last_seen_at)
        };
      }),
      recent: (recentRows as ApiRequestRecentRow[]).map((row) => ({
        id: row.id,
        method: row.method,
        route: row.route,
        path: row.path,
        statusCode: toNumber(row.status_code),
        durationMs: toNumber(row.duration_ms),
        actorHash: row.actor_hash,
        roles: row.roles ?? [],
        teamSlugs: row.team_slugs ?? [],
        errorName: row.error_name,
        createdAt: toIsoString(row.created_at)
      }))
    };
  }

  async errorBudget(): Promise<ErrorBudgetReport> {
    const availabilityTarget = readSloThreshold("SLO_MIN_API_SUCCESS_RATE", 0.95);
    const allowedErrorRate = Math.max(1 - availabilityTarget, 0.001);
    const minimumRequestVolume = readCountThreshold("ERROR_BUDGET_MIN_REQUESTS", 10);
    const connection = this.orm.em.fork().getConnection();
    const [windowRows, offenderRows] = await Promise.all([
      connection.execute<ErrorBudgetWindowRow[]>(`
        with windows(window_id, duration_minutes, since_at) as (
          values
            ('5m'::text, 5, now() - interval '5 minutes'),
            ('1h'::text, 60, now() - interval '1 hour'),
            ('24h'::text, 1440, now() - interval '24 hours')
        )
        select
          w.window_id,
          count(l.id)::int as request_count,
          count(l.id) filter (where l.status_code >= 500)::int as error_count,
          coalesce(percentile_cont(0.95) within group (order by l.duration_ms), 0)::float as p95_duration_ms
        from windows w
        left join api_request_logs l on l.created_at >= w.since_at
        group by w.window_id, w.duration_minutes
        order by w.duration_minutes;
      `),
      connection.execute<ApiEndpointRow[]>(`
        select
          method,
          route,
          count(*)::int as total,
          count(*) filter (where status_code < 500)::int as ok,
          count(*) filter (where status_code >= 500)::int as errors,
          coalesce(percentile_cont(0.50) within group (order by duration_ms), 0)::float as p50_duration_ms,
          coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)::float as p95_duration_ms,
          max(created_at) as last_seen_at
        from api_request_logs
        where created_at >= now() - interval '24 hours'
        group by method, route
        having count(*) filter (where status_code >= 500) > 0
        order by errors desc, p95_duration_ms desc, total desc
        limit 5;
      `)
    ]);
    const windows = buildErrorBudgetWindows({
      rows: windowRows,
      availabilityTarget,
      allowedErrorRate,
      minimumRequestVolume
    });
    const dayWindow = windows.find((window) => window.id === "24h") ?? windows[windows.length - 1];
    const worstBurnRate = roundMetric(Math.max(...windows.map((window) => window.burnRate), 0));
    const topOffenders = (offenderRows as ApiEndpointRow[]).map((row) => {
      const requestCount = toNumber(row.total);
      const errorCount = toNumber(row.errors);
      return {
        method: row.method,
        route: row.route,
        requestCount,
        errorCount,
        errorRate: ratio(errorCount, requestCount),
        p95DurationMs: Math.round(toNumber(row.p95_duration_ms)),
        lastSeenAt: toIsoString(row.last_seen_at)
      };
    });
    const status = aggregateErrorBudgetStatus(windows);

    return {
      schemaVersion: "opspilot.error_budget.v1",
      generatedAt: new Date().toISOString(),
      status,
      objective: {
        availabilityTarget,
        allowedErrorRate: roundMetric(allowedErrorRate),
        window: "rolling_24h",
        minimumRequestVolume
      },
      summary: {
        totalRequests: dayWindow?.requestCount ?? 0,
        totalErrors: dayWindow?.errorCount ?? 0,
        availability: dayWindow?.availability ?? 1,
        errorRate: dayWindow?.errorRate ?? 0,
        errorBudgetRemaining: dayWindow?.errorBudgetRemaining ?? 1,
        worstBurnRate,
        releaseRecommendation: status === "freeze" || status === "page" ? "freeze" : status === "watch" ? "watch" : "ship"
      },
      windows,
      topOffenders,
      actions: buildErrorBudgetActions({ status, windows, topOffenders })
    };
  }

  async slo(): Promise<ObservabilitySloReport> {
    const connection = this.orm.em.fork().getConnection();
    const [summary, latestEvalRows, toolCoverageRows, apiRequestRows, errorBudget] = await Promise.all([
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
      `),
      connection.execute<ApiRequestSummaryRow[]>(`
        select
          count(*)::int as total,
          count(*) filter (where status_code < 500)::int as ok,
          0::int as errors,
          0::float as p50_duration_ms,
          0::float as p95_duration_ms
        from api_request_logs
        where created_at >= now() - interval '24 hours';
      `),
      this.errorBudget()
    ]);
    const toolCoverage = ratio(toNumber(toolCoverageRows[0]?.covered), toNumber(toolCoverageRows[0]?.total));
    const latestEvalPassed = latestEvalRows[0]?.passed === true ? 1 : 0;
    const apiSuccessRate = ratioOrOne(toNumber(apiRequestRows[0]?.ok), toNumber(apiRequestRows[0]?.total));
    const objectives: SloObjective[] = [
      buildObjective({
        id: "answer_grounding",
        label: "답변 근거성",
        description: "평균 답변/문서 일치율이 설정된 근거성 목표 이상이어야 합니다.",
        metric: "averageDocumentAgreement",
        operator: "gte",
        target: readSloThreshold("SLO_MIN_DOCUMENT_AGREEMENT", 0.8),
        actual: summary.answers.averageDocumentAgreement,
        source: "answers",
        window: "all_time"
      }),
      buildObjective({
        id: "review_load",
        label: "검토 부하",
        description: "사람 검토 비율이 운영자가 처리 가능한 기준 안에 있어야 합니다.",
        metric: "humanReviewRate",
        operator: "lte",
        target: readSloThreshold("SLO_MAX_HUMAN_REVIEW_RATE", 0.7),
        actual: summary.answers.humanReviewRate,
        source: "answers",
        window: "all_time"
      }),
      buildObjective({
        id: "tool_audit_coverage",
        label: "도구 감사 커버리지",
        description: "질문은 저장된 search_documents 도구 호출로 추적돼야 합니다.",
        metric: "searchDocumentsCoverage",
        operator: "gte",
        target: readSloThreshold("SLO_MIN_TOOL_AUDIT_COVERAGE", 0.95),
        actual: toolCoverage,
        source: "tool_calls",
        window: "all_time"
      }),
      buildObjective({
        id: "eval_gate",
        label: "평가 게이트",
        description: "최신 seed 평가가 설정된 품질 게이트를 통과해야 합니다.",
        metric: "latestEvaluationPassed",
        operator: "gte",
        target: 1,
        actual: latestEvalPassed,
        source: "evaluations",
        window: "latest_eval"
      }),
      buildObjective({
        id: "api_success_rate",
        label: "API 성공률",
        description: "최근 24시간 HTTP 요청에서 5xx 응답이 목표치 이하로 유지돼야 합니다.",
        metric: "apiSuccessRate",
        operator: "gte",
        target: readSloThreshold("SLO_MIN_API_SUCCESS_RATE", 0.95),
        actual: apiSuccessRate,
        source: "api_requests",
        window: "last_24h"
      }),
      buildObjective({
        id: "api_error_budget",
        label: "API 오류 예산",
        description: "최근 API 실패가 허용 오류 예산 안에서 소모돼야 합니다.",
        metric: "apiErrorBudgetRemaining",
        operator: "gte",
        target: 0,
        actual: errorBudget.summary.errorBudgetRemaining,
        source: "api_requests",
        window: "last_24h"
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
    const [summary, slo, readiness, latestEvalRows, freshnessRows, errorBudget] = await Promise.all([
      this.summary(),
      this.slo(),
      this.healthService.readiness(),
      connection.execute<EvaluationPassRow[]>(`
        select (details->>'passed')::boolean as passed, created_at
        from evaluation_results
        where suite_name = 'seed-ops-wiki'
        order by created_at desc
        limit 1;
      `),
      connection.execute<KnowledgeFreshnessRow[]>(`
        with latest_eval as (
          select max(created_at) as created_at
          from evaluation_results
          where suite_name = 'seed-ops-wiki'
        )
        select
          (select created_at from latest_eval) as latest_eval_created_at,
          (select max(updated_at) from documents) as latest_document_updated_at,
          (
            select count(*)::int
            from documents d
            cross join latest_eval e
            where e.created_at is null or d.updated_at > e.created_at
          ) as changed_documents_since_eval;
      `),
      this.errorBudget()
    ]);
    const latestEvalPassed = latestEvalRows[0]?.passed === true;
    const pendingApprovals = summary.approvals.byStatus.pending ?? 0;
    const knowledgeFreshness = toKnowledgeFreshness(freshnessRows[0]);
    const checks = buildReleaseGateChecks({
      summary,
      slo,
      readiness,
      latestEvalPassed,
      pendingApprovals,
      knowledgeFreshness,
      errorBudget
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
        feedback: summary.feedback.total,
        knowledgeFreshness
      }
    };
  }

  async actionPlan(): Promise<OperationalActionPlan> {
    const [gate, slo, errorBudget] = await Promise.all([this.releaseGate(), this.slo(), this.errorBudget()]);
    const releaseGateActions = gate.checks
      .filter((check) => check.status !== "pass")
      .map((check) => actionFromReleaseGateCheck(check, gate.status));
    const sloActions = slo.objectives
      .filter((objective) => objective.status !== "ok")
      .map((objective) => actionFromSloObjective(objective));
    const errorBudgetActions = errorBudget.actions.map((action, index) => actionFromErrorBudgetAction(action, index));
    const actions = [...releaseGateActions, ...sloActions, ...errorBudgetActions];

    if (actions.length === 0) {
      actions.push(buildReleaseWatchAction(gate.status));
    }

    const owners = [...new Set(actions.map((action) => action.owner))].sort();

    return {
      schemaVersion: "opspilot.operational_action_plan.v1",
      generatedAt: new Date().toISOString(),
      status: gate.status,
      summary: {
        actionCount: actions.length,
        p0: actions.filter((action) => action.priority === "p0").length,
        p1: actions.filter((action) => action.priority === "p1").length,
        p2: actions.filter((action) => action.priority === "p2").length,
        owners,
        releaseRecommendation: gate.status === "pass" ? "ship" : gate.status === "review" ? "ship_after_review" : "hold"
      },
      actions: actions.sort(compareActions)
    };
  }

  async portfolioReadiness(): Promise<PortfolioReadinessReport> {
    const [summary, apiRequests, slo, gate, actionPlan] = await Promise.all([
      this.summary(),
      this.apiRequests(),
      this.slo(),
      this.releaseGate(),
      this.actionPlan()
    ]);
    const pillars = buildPortfolioPillars({ summary, apiRequests, slo, gate });
    const pass = pillars.filter((pillar) => pillar.status === "pass").length;
    const warn = pillars.filter((pillar) => pillar.status === "warn").length;
    const fail = pillars.filter((pillar) => pillar.status === "fail").length;
    const score = roundMetric(average(pillars.map((pillar) => pillar.score)));

    return {
      schemaVersion: "opspilot.portfolio_readiness.v1",
      generatedAt: new Date().toISOString(),
      status: fail > 0 ? "block" : warn > 0 || gate.status === "review" ? "review" : "pass",
      score,
      headline: portfolioHeadline(score, fail, warn),
      summary: {
        pass,
        warn,
        fail,
        evidenceCount: pillars.reduce((total, pillar) => total + pillar.verification.length + pillar.links.length, 0),
        actionCount: actionPlan.summary.actionCount,
        releaseRecommendation: actionPlan.summary.releaseRecommendation,
        documents: summary.documents.total,
        chunks: summary.documents.chunks,
        averageDocumentAgreement: summary.answers.averageDocumentAgreement,
        apiSuccessRate: apiRequests.summary.successRate
      },
      pillars,
      demoPath: [
        {
          step: 1,
          screen: "문서",
          action: "Markdown 등록 후 색인 설명과 영향 분석을 엽니다.",
          proof: "청크 수, 헤딩 보존, 임베딩 커버리지, 문서 변경 이후 오래된 답변을 확인합니다."
        },
        {
          step: 2,
          screen: "검색",
          action: "검색 미리보기 후 실제 답변까지 검증을 실행합니다.",
          proof: "후보 1순위와 실제 답변 출처, 출처 겹침, 문서 일치율, search_documents 호출을 비교합니다."
        },
        {
          step: 3,
          screen: "질문",
          action: "일반 질문과 민감 작업 질문을 각각 실행합니다.",
          proof: "일반 답변은 출처와 신뢰 게이트를 보여주고, 민감 작업은 사람 승인으로 분리합니다."
        },
        {
          step: 4,
          screen: "대응",
          action: "정산 지연 장애 대응 플랜을 생성합니다.",
          proof: "런북 기반 단계, 승인 게이트, 질문 단위 감사 번들, 감사 원장 SHA-256 해시를 확인합니다."
        },
        {
          step: 5,
          screen: "품질",
          action: "포트폴리오 준비도, 릴리즈 게이트, SLO, 운영 액션 플랜을 확인합니다.",
          proof: "현재 데모가 면접에서 보여줄 수 있는 수준인지 서버가 계산한 게이트로 설명합니다."
        }
      ]
    };
  }

  async auditLedger(limit = 40): Promise<AuditLedgerReport> {
    const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 40;
    const normalizedLimit = Math.max(1, Math.min(requestedLimit, 100));
    const connection = this.orm.em.fork().getConnection();
    const rows = await connection.execute<AuditLedgerRow[]>(
      `
        with recent_events as (
          select
            q.id::text as id,
            'question'::text as event_type,
            q.id::text as question_id,
            coalesce(q.channel, 'unknown') as status,
            q.created_at,
            jsonb_build_object(
              'questionId', q.id::text,
              'channel', coalesce(q.channel, 'unknown'),
              'actorHash', encode(digest(coalesce(q.actor::text, ''), 'sha256'), 'hex'),
              'textHash', encode(digest(coalesce(q.text, ''), 'sha256'), 'hex'),
              'textPreview', left(q.text, 80),
              'textLength', char_length(q.text)
            ) as payload
          from questions q

          union all

          select
            a.id::text as id,
            'answer'::text as event_type,
            a.question_id::text as question_id,
            case when a.needs_human_review then 'needs_human_review' else 'ready' end as status,
            a.created_at,
            jsonb_build_object(
              'answerId', a.id::text,
              'questionId', a.question_id::text,
              'confidence', a.confidence,
              'needsHumanReview', a.needs_human_review,
              'documentAgreement', coalesce((a.metadata #>> '{documentAgreement,score}')::float, 0),
              'answerHash', encode(digest(coalesce(a.text, ''), 'sha256'), 'hex'),
              'answerPreview', left(a.text, 80),
              'answerLength', char_length(a.text)
            ) as payload
          from answers a

          union all

          select
            t.id::text as id,
            'tool_call'::text as event_type,
            t.question_id::text as question_id,
            t.status::text as status,
            t.created_at,
            jsonb_build_object(
              'toolCallId', t.id::text,
              'questionId', t.question_id::text,
              'toolName', t.tool_name,
              'status', t.status::text,
              'inputHash', encode(digest(coalesce(t.input::text, ''), 'sha256'), 'hex'),
              'outputHash', encode(digest(coalesce(t.output::text, ''), 'sha256'), 'hex')
            ) as payload
          from tool_call_logs t

          union all

          select
            ar.id::text as id,
            'approval'::text as event_type,
            ar.question_id::text as question_id,
            ar.status::text as status,
            ar.created_at,
            jsonb_build_object(
              'approvalId', ar.id::text,
              'questionId', ar.question_id::text,
              'action', ar.action,
              'status', ar.status::text,
              'reasonHash', encode(digest(coalesce(ar.reason::text, ''), 'sha256'), 'hex')
            ) as payload
          from approval_requests ar

          union all

          select
            f.id::text as id,
            'feedback'::text as event_type,
            a.question_id::text as question_id,
            case when f.rating > 0 then 'helpful' when f.rating < 0 then 'needs_work' else 'neutral' end as status,
            f.created_at,
            jsonb_build_object(
              'feedbackId', f.id::text,
              'answerId', f.answer_id::text,
              'questionId', a.question_id::text,
              'rating', f.rating,
              'commentHash', encode(digest(coalesce(f.comment, ''), 'sha256'), 'hex'),
              'commentPreview', left(coalesce(f.comment, ''), 80)
            ) as payload
          from feedback f
          left join answers a on a.id = f.answer_id
        )
        select id, event_type, question_id, status, created_at, payload
        from recent_events
        order by created_at desc, id desc
        limit ?;
      `,
      [normalizedLimit]
    );
    const chronologicalRows = [...rows].reverse();
    let previousHash = "0".repeat(64);
    const events = chronologicalRows.map((row, index) => {
      const payload = normalizeRecord(row.payload);
      const createdAt = toIsoString(row.created_at);
      const eventBasis = {
        id: row.id,
        type: row.event_type,
        questionId: row.question_id,
        status: row.status,
        createdAt,
        payload
      };
      const eventHash = sha256(stableStringify(eventBasis));
      const chainHash = sha256(stableStringify({ previousHash, eventHash }));
      const event: AuditLedgerEvent = {
        sequence: index + 1,
        id: row.id,
        type: row.event_type,
        questionId: row.question_id,
        status: row.status,
        createdAt,
        payload,
        previousHash,
        eventHash,
        chainHash
      };
      previousHash = chainHash;
      return event;
    });
    const byType = toTypedCountMap(events.map((event) => event.type), ["question", "answer", "tool_call", "approval", "feedback"]);
    const byStatus = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.status] = (acc[event.status] ?? 0) + 1;
      return acc;
    }, {});
    const verified = verifyLedger(events);

    return {
      schemaVersion: "opspilot.audit_ledger.v1",
      generatedAt: new Date().toISOString(),
      algorithm: "sha256",
      canonicalization: "stable_json_v1",
      verified,
      rootHash: events.at(-1)?.chainHash ?? previousHash,
      window: {
        limit: normalizedLimit,
        eventCount: events.length,
        firstEventAt: events[0]?.createdAt ?? null,
        lastEventAt: events.at(-1)?.createdAt ?? null
      },
      summary: {
        byType,
        byStatus,
        questionLinkedEvents: events.filter((event) => event.questionId).length,
        tamperEvident: verified && events.length > 0
      },
      events
    };
  }
}

function buildPortfolioPillars(input: {
  summary: ObservabilitySummary;
  apiRequests: ApiRequestObservabilityReport;
  slo: ObservabilitySloReport;
  gate: ObservabilityReleaseGate;
}): PortfolioReadinessPillar[] {
  const checks = Object.fromEntries(input.gate.checks.map((check) => [check.id, check]));
  const searchCalls = input.summary.toolCalls.byName.search_documents ?? 0;
  const approvalCalls = input.summary.toolCalls.byName.request_human_approval ?? 0;
  const runbookCalls = input.summary.toolCalls.byName.create_runbook_checklist ?? 0;
  const documentAgreement = input.summary.answers.averageDocumentAgreement;
  const apiSuccessRate = input.apiRequests.summary.successRate;
  const errorBudgetCheck = checks.api_error_budget;

  return [
    {
      id: "rag_grounding",
      label: "RAG 근거성과 문서 일치",
      status: weakestStatus([
        checks.indexed_knowledge_ready?.status ?? "fail",
        checks.latest_eval_gate?.status ?? "fail",
        checks.knowledge_freshness?.status ?? "fail",
        documentAgreement >= 0.8 ? "pass" : documentAgreement >= 0.7 ? "warn" : "fail"
      ]),
      score: roundMetric(average([documentAgreement, statusScore(checks.latest_eval_gate?.status), statusScore(checks.knowledge_freshness?.status)])),
      evidence: `문서 ${input.summary.documents.total}개, 청크 ${input.summary.documents.chunks}개, 평균 문서 일치율 ${Math.round(documentAgreement * 100)}%, 최신 평가 ${checks.latest_eval_gate?.status ?? "missing"}.`,
      whyItMatters: "AI 답변이 그럴듯한 문장에 그치지 않고 실제 운영 문서와 얼마나 붙어 있는지 보여줍니다.",
      demoScript: "검색 화면에서 미리보기-답변 검증을 실행해 후보 출처와 실제 답변 출처가 일치하는지 설명합니다.",
      verification: ["pnpm eval", "pnpm agreement:smoke", "pnpm retrieval-robustness:smoke", "pnpm index-quality:smoke"],
      links: [
        { label: "검색 미리보기", href: "/retrieval/preview" },
        { label: "색인 품질", href: "/documents/index-quality" }
      ]
    },
    {
      id: "permission_boundary",
      label: "권한 경계와 사람 승인",
      status: weakestStatus([approvalCalls > 0 ? "pass" : "fail", checks.approval_backlog?.status ?? "fail"]),
      score: roundMetric(average([approvalCalls > 0 ? 1 : 0, statusScore(checks.approval_backlog?.status)])),
      evidence: `request_human_approval ${approvalCalls}회, 대기 승인 ${input.summary.approvals.byStatus.pending ?? 0}개, 승인 게이트 ${checks.approval_backlog?.status ?? "missing"}.`,
      whyItMatters: "민감 작업을 자동 실행하지 않고 사람 승인으로 분리하는 경계를 증명합니다.",
      demoScript: "운영 DB 수정 질문을 던지고 승인 화면에서 pending 요청과 검토 사유를 보여줍니다.",
      verification: ["pnpm permission:smoke", "pnpm retrieval-permission-diff:smoke", "pnpm review:smoke"],
      links: [
        { label: "권한 비교", href: "/retrieval/permission-diff" },
        { label: "승인 대기열", href: "/approvals" }
      ]
    },
    {
      id: "tool_audit",
      label: "도구 호출과 감사 재현성",
      status: weakestStatus([searchCalls > 0 ? "pass" : "fail", runbookCalls > 0 ? "pass" : "warn", checks.agent_audit_trail?.status ?? "fail"]),
      score: roundMetric(average([searchCalls > 0 ? 1 : 0, runbookCalls > 0 ? 1 : 0.75, statusScore(checks.agent_audit_trail?.status)])),
      evidence: `search_documents ${searchCalls}회, create_runbook_checklist ${runbookCalls}회, 전체 도구 호출 ${input.summary.toolCalls.total}회.`,
      whyItMatters: "에이전트가 어떤 도구를 왜 호출했는지 사후에 재현할 수 있어야 운영 시스템으로 신뢰할 수 있습니다.",
      demoScript: "감사 화면과 장애 대응 감사 번들에서 도구 호출 상태, 출처 계보, 정책 통과 여부, 원장 루트 해시를 확인합니다.",
      verification: ["pnpm trace:smoke", "pnpm evidence-bundle:smoke", "pnpm question-audit:smoke", "pnpm audit-ledger:smoke"],
      links: [
        { label: "도구 감사", href: "/tools/calls" },
        { label: "질문 감사 번들", href: "/questions/{id}/audit-bundle" }
      ]
    },
    {
      id: "operational_reliability",
      label: "운영성, SLO, API 안정성",
      status: weakestStatus([
        checks.dependencies_ready?.status ?? "fail",
        input.slo.status === "ok" ? "pass" : input.slo.status === "warn" ? "warn" : "fail",
        errorBudgetCheck?.status ?? "fail",
        apiSuccessRate >= 0.95 ? "pass" : apiSuccessRate >= 0.9 ? "warn" : "fail"
      ]),
      score: roundMetric(
        average([
          statusScore(checks.dependencies_ready?.status),
          input.slo.status === "ok" ? 1 : input.slo.status === "warn" ? 0.75 : 0,
          statusScore(errorBudgetCheck?.status),
          apiSuccessRate
        ])
      ),
      evidence: `릴리즈 게이트 ${input.gate.status}, SLO ${input.slo.status}, 오류 예산 ${errorBudgetCheck?.status ?? "missing"}, API 성공률 ${Math.round(apiSuccessRate * 100)}%, p95 ${input.apiRequests.summary.p95DurationMs}ms.`,
      whyItMatters: "데모 앱이 아니라 운영 서비스처럼 준비 상태, 요청 품질, 오류 예산, 회복 액션을 보여줍니다.",
      demoScript: "품질 화면에서 릴리즈 게이트, SLO 가드레일, 오류 예산, 운영 액션 플랜을 순서대로 엽니다.",
      verification: ["pnpm readiness:smoke", "pnpm observability:slo-smoke", "pnpm error-budget:smoke", "pnpm release-gate:smoke"],
      links: [
        { label: "릴리즈 게이트", href: "/observability/release-gate" },
        { label: "오류 예산", href: "/observability/error-budget" },
        { label: "API 요청 관측성", href: "/observability/api-requests" }
      ]
    },
    {
      id: "demo_artifacts",
      label: "포트폴리오 산출물과 재현성",
      status: weakestStatus([
        input.summary.documents.total >= 5 ? "pass" : "fail",
        input.summary.feedback.total > 0 ? "pass" : "warn",
        input.gate.status === "block" ? "fail" : input.gate.status === "review" ? "warn" : "pass"
      ]),
      score: roundMetric(average([input.summary.documents.total >= 5 ? 1 : 0, input.summary.feedback.total > 0 ? 1 : 0.75, statusScore(input.gate.status === "block" ? "fail" : input.gate.status === "review" ? "warn" : "pass")])),
      evidence: `README 스크린샷, 사용법 페이지, 데모 리포트, 웹 smoke 경로가 준비됐고 서버 증거 ${input.summary.toolCalls.total}개를 집계했습니다.`,
      whyItMatters: "코드만 있는 프로젝트가 아니라 면접관이 같은 순서로 실행하고 검증할 수 있는 산출물이 됩니다.",
      demoScript: "사용법 화면에서 데모 순서를 열고, README 스크린샷과 `pnpm portfolio:report` 결과를 연결해 설명합니다.",
      verification: ["pnpm portfolio:demo", "pnpm portfolio:report", "pnpm web:smoke"],
      links: [
        { label: "사용법", href: "/usage" },
        { label: "데모 리포트", href: "docs/demo-report.md" }
      ]
    }
  ];
}

function weakestStatus(statuses: ReleaseGateCheckStatus[]): ReleaseGateCheckStatus {
  if (statuses.includes("fail")) {
    return "fail";
  }
  if (statuses.includes("warn")) {
    return "warn";
  }
  return "pass";
}

function statusScore(status: ReleaseGateCheckStatus | undefined): number {
  if (status === "pass") {
    return 1;
  }
  if (status === "warn") {
    return 0.75;
  }
  return 0;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toTypedCountMap<T extends string>(values: T[], keys: T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function verifyLedger(events: AuditLedgerEvent[]): boolean {
  let previousHash = "0".repeat(64);
  for (const event of events) {
    const eventBasis = {
      id: event.id,
      type: event.type,
      questionId: event.questionId,
      status: event.status,
      createdAt: event.createdAt,
      payload: event.payload
    };
    const eventHash = sha256(stableStringify(eventBasis));
    const chainHash = sha256(stableStringify({ previousHash, eventHash }));
    if (event.previousHash !== previousHash || event.eventHash !== eventHash || event.chainHash !== chainHash) {
      return false;
    }
    previousHash = chainHash;
  }
  return true;
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

function buildErrorBudgetWindows(input: {
  rows: ErrorBudgetWindowRow[];
  availabilityTarget: number;
  allowedErrorRate: number;
  minimumRequestVolume: number;
}): ErrorBudgetWindow[] {
  const labels: Record<ErrorBudgetWindow["id"], { label: string; durationMinutes: number }> = {
    "5m": { label: "최근 5분", durationMinutes: 5 },
    "1h": { label: "최근 1시간", durationMinutes: 60 },
    "24h": { label: "최근 24시간", durationMinutes: 1440 }
  };
  const rowsById = new Map(input.rows.map((row) => [row.window_id, row]));

  return (Object.keys(labels) as ErrorBudgetWindow["id"][]).map((id) => {
    const row = rowsById.get(id);
    const requestCount = toNumber(row?.request_count);
    const errorCount = toNumber(row?.error_count);
    const errorRate = ratio(errorCount, requestCount);
    const availability = requestCount === 0 ? 1 : roundMetric(1 - errorRate);
    const burnRate = requestCount < input.minimumRequestVolume ? 0 : roundMetric(errorRate / input.allowedErrorRate);
    const errorBudgetRemaining = requestCount === 0 ? 1 : clampMetric((input.allowedErrorRate - errorRate) / input.allowedErrorRate);
    const status = errorBudgetWindowStatus({
      id,
      requestCount,
      burnRate,
      errorBudgetRemaining,
      minimumRequestVolume: input.minimumRequestVolume
    });

    return {
      id,
      label: labels[id].label,
      durationMinutes: labels[id].durationMinutes,
      requestCount,
      errorCount,
      availability,
      errorRate,
      allowedErrorRate: roundMetric(input.allowedErrorRate),
      burnRate,
      errorBudgetRemaining,
      status
    };
  });
}

function errorBudgetWindowStatus(input: {
  id: ErrorBudgetWindow["id"];
  requestCount: number;
  burnRate: number;
  errorBudgetRemaining: number;
  minimumRequestVolume: number;
}): ErrorBudgetWindow["status"] {
  if (input.requestCount < input.minimumRequestVolume) {
    return "healthy";
  }

  if (input.errorBudgetRemaining < 0 || input.burnRate >= (input.id === "5m" ? 14 : 6)) {
    return "freeze";
  }

  if (input.burnRate >= (input.id === "5m" ? 6 : 3)) {
    return "page";
  }

  if (input.burnRate >= 1 || input.errorBudgetRemaining < 0.25) {
    return "watch";
  }

  return "healthy";
}

function aggregateErrorBudgetStatus(windows: ErrorBudgetWindow[]): ErrorBudgetReport["status"] {
  if (windows.some((window) => window.status === "freeze")) {
    return "freeze";
  }
  if (windows.some((window) => window.status === "page")) {
    return "page";
  }
  if (windows.some((window) => window.status === "watch")) {
    return "watch";
  }
  return "healthy";
}

function buildErrorBudgetActions(input: {
  status: ErrorBudgetReport["status"];
  windows: ErrorBudgetWindow[];
  topOffenders: ErrorBudgetEndpoint[];
}): ErrorBudgetAction[] {
  if (input.status === "healthy") {
    return [];
  }

  const worstWindow = [...input.windows].sort((left, right) => right.burnRate - left.burnRate)[0];
  const topOffender = input.topOffenders[0];
  const priority: ErrorBudgetAction["priority"] = input.status === "freeze" ? "p0" : input.status === "page" ? "p1" : "p2";
  const actions: ErrorBudgetAction[] = [
    {
      priority,
      owner: "platform",
      title: input.status === "freeze" ? "배포 동결 및 5xx 원인 제거" : "오류 예산 번레이트 확인",
      reason: `${worstWindow?.label ?? "최근 창"} burn rate ${worstWindow?.burnRate ?? 0}x, 오류 예산 ${Math.round((worstWindow?.errorBudgetRemaining ?? 0) * 100)}%.`,
      verification: ["pnpm error-budget:smoke", "pnpm observability:slo-smoke", "pnpm release-gate:smoke"]
    }
  ];

  if (topOffender) {
    actions.push({
      priority,
      owner: "ops",
      title: "최상위 실패 endpoint 점검",
      reason: `${topOffender.method} ${topOffender.route}에서 5xx ${topOffender.errorCount}/${topOffender.requestCount}건, p95 ${topOffender.p95DurationMs}ms.`,
      verification: ["pnpm error-budget:smoke", "pnpm web:smoke"]
    });
  }

  return actions;
}

function portfolioHeadline(score: number, fail: number, warn: number): string {
  if (fail > 0) {
    return "핵심 증거가 부족해 데모 전에 보강이 필요합니다.";
  }
  if (warn > 0) {
    return `면접 데모 가능 상태입니다. 다만 ${warn}개 항목은 설명 전에 확인하세요.`;
  }
  if (score >= 0.95) {
    return "RAG, 권한, 도구 호출, 운영성 증거가 모두 데모 가능한 상태입니다.";
  }
  return "주요 포트폴리오 증거가 준비됐습니다.";
}

function actionFromReleaseGateCheck(check: ReleaseGateCheck, gateStatus: ReleaseGateStatus): OperationalAction {
  return {
    id: `release_${check.id}`,
    title: releaseActionTitle(check.id, check.label),
    priority: check.status === "fail" || gateStatus === "block" ? "p0" : check.id === "feedback_signal" ? "p2" : "p1",
    owner: check.owner,
    status: "open",
    source: "release_gate",
    sourceId: check.id,
    reason: check.evidence,
    impact: releaseActionImpact(check.id, check.status),
    actionItems: releaseActionItems(check),
    verification: releaseVerificationCommands(check.id),
    links: releaseLinks(check.id)
  };
}

function actionFromSloObjective(objective: SloObjective): OperationalAction {
  return {
    id: `slo_${objective.id}`,
    title: sloActionTitle(objective.id, objective.label),
    priority: objective.status === "breach" ? "p0" : "p1",
    owner: sloOwner(objective),
    status: "open",
    source: "slo",
    sourceId: objective.id,
    reason: `${objective.metric}=${objective.actual}, target=${objective.target}, status=${objective.status}.`,
    impact: sloImpact(objective.id),
    actionItems: sloActionItems(objective),
    verification: ["pnpm observability:slo-smoke", "pnpm release-gate:smoke"],
    links: [{ label: "SLO API", href: "/observability/slo" }]
  };
}

function actionFromErrorBudgetAction(action: ErrorBudgetAction, index: number): OperationalAction {
  return {
    id: `error_budget_${index + 1}`,
    title: action.title,
    priority: action.priority,
    owner: action.owner,
    status: "open",
    source: "slo",
    sourceId: "api_error_budget",
    reason: action.reason,
    impact: "오류 예산이 빠르게 소진되면 Slack/Web 운영 채널에서 답변 자체보다 시스템 신뢰성이 먼저 무너집니다.",
    actionItems: [
      "최근 창별 burn rate와 5xx endpoint를 확인합니다.",
      "원인 endpoint를 롤백하거나 실패 응답을 줄인 뒤 오류 예산을 다시 계산합니다."
    ],
    verification: action.verification,
    links: [{ label: "오류 예산 API", href: "/observability/error-budget" }]
  };
}

function buildReleaseWatchAction(status: ReleaseGateStatus): OperationalAction {
  return {
    id: "release_watch",
    title: "배포 상태 유지 관찰",
    priority: "p2",
    owner: "quality",
    status: "watch",
    source: "operational_watch",
    sourceId: "release_gate",
    reason: `배포 게이트 상태는 ${status}입니다.`,
    impact: "현재는 차단 액션이 없지만, 문서 변경이나 새 피드백 이후 품질 게이트가 오래된 상태가 될 수 있습니다.",
    actionItems: [
      "배포 전 최신 평가, 오류 예산, 웹 스모크를 다시 실행합니다.",
      "새 문서가 추가되면 검색 강건성 리포트와 문서 영향 분석을 확인합니다.",
      "민감 작업 승인 대기열이 증가하는지 확인합니다."
    ],
    verification: ["pnpm eval", "pnpm error-budget:smoke", "pnpm release-gate:smoke", "pnpm web:smoke"],
    links: [{ label: "배포 게이트", href: "/observability/release-gate" }]
  };
}

function releaseActionTitle(id: string, fallback: string): string {
  const titles: Record<string, string> = {
    dependencies_ready: "의존성 복구",
    indexed_knowledge_ready: "지식 베이스 색인 보강",
    latest_eval_gate: "최신 평가 게이트 복구",
    knowledge_freshness: "문서 변경 후 재평가",
    slo_guardrails: "SLO 위반 원인 제거",
    api_error_budget: "API 오류 예산 회복",
    agent_audit_trail: "에이전트 감사 추적 보강",
    approval_backlog: "승인 대기열 정리",
    feedback_signal: "피드백 신호 수집"
  };
  return titles[id] ?? fallback;
}

function releaseActionImpact(id: string, status: ReleaseGateCheckStatus): string {
  const severity = status === "fail" ? "배포 차단" : "배포 전 검토";
  const impacts: Record<string, string> = {
    dependencies_ready: `${severity}: API가 PostgreSQL/Redis/Elasticsearch 상태를 보장하지 못하면 답변 생성과 감사가 불안정합니다.`,
    indexed_knowledge_ready: `${severity}: 색인된 문서나 청크가 부족하면 RAG 답변이 근거 부족 상태가 됩니다.`,
    latest_eval_gate: `${severity}: 최신 평가가 없거나 실패하면 회귀 여부를 증명할 수 없습니다.`,
    knowledge_freshness: `${severity}: 문서가 바뀐 뒤 평가가 오래되면 현재 지식 기준 답변 품질을 보장할 수 없습니다.`,
    slo_guardrails: `${severity}: SLO가 흔들리면 운영 채널에 자동 답변을 공유하기 어렵습니다.`,
    api_error_budget: `${severity}: 최근 API 실패가 허용 오류 예산을 빠르게 소모하면 배포를 멈추고 원인을 제거해야 합니다.`,
    agent_audit_trail: `${severity}: 도구 호출 증거가 부족하면 운영 판단을 사후 재현할 수 없습니다.`,
    approval_backlog: `${severity}: 민감 작업 승인 대기열이 쌓이면 운영 처리 시간이 늘어납니다.`,
    feedback_signal: `${severity}: 피드백이 없으면 답변 신뢰 게이트가 실제 사용자 신호를 반영하지 못합니다.`
  };
  return impacts[id] ?? `${severity}: ${id} 항목을 확인해야 합니다.`;
}

function releaseActionItems(check: ReleaseGateCheck): string[] {
  const items: Record<string, string[]> = {
    dependencies_ready: ["docker compose 상태를 확인하고 실패한 의존성을 재시작합니다.", "`/health/ready` 응답에서 모든 dependency가 ok인지 확인합니다."],
    indexed_knowledge_ready: ["`pnpm ingest`로 seed 문서를 다시 색인합니다.", "문서 화면에서 청크 수와 색인 품질 리포트를 확인합니다."],
    latest_eval_gate: ["`pnpm eval`을 실행해 최신 평가 결과를 생성합니다.", "실패 케이스는 `GET /evaluations/cases`에서 기대 출처와 일치율을 확인합니다."],
    knowledge_freshness: ["변경된 문서의 영향 분석을 확인합니다.", "`pnpm eval`과 `pnpm freshness:smoke`를 순서대로 실행합니다."],
    slo_guardrails: ["`GET /observability/slo`에서 warn/breach objective를 확인합니다.", "문서 일치율, 검토 부하, 도구 감사 커버리지 중 실패한 지표를 먼저 복구합니다."],
    api_error_budget: ["`GET /observability/error-budget`에서 5분/1시간/24시간 burn rate를 확인합니다.", "top offender endpoint의 5xx 원인을 제거하거나 배포를 동결합니다."],
    agent_audit_trail: ["질문 실행 시 `search_documents` tool log가 저장되는지 확인합니다.", "민감 작업 질문으로 `request_human_approval` 경계를 검증합니다."],
    approval_backlog: ["승인 화면에서 pending 요청을 승인 또는 반려합니다.", "민감 작업 정책이 과도하게 넓지 않은지 확인합니다."],
    feedback_signal: ["대표 질문에 대해 `도움됨/개선 필요` 피드백을 저장합니다.", "답변 신뢰 게이트가 feedback_signal 체크를 반영하는지 확인합니다."]
  };
  return items[check.id] ?? [`${check.label} 항목의 evidence를 확인합니다.`, "수정 후 release gate를 다시 실행합니다."];
}

function releaseVerificationCommands(id: string): string[] {
  const commands: Record<string, string[]> = {
    dependencies_ready: ["pnpm readiness:smoke", "pnpm release-gate:smoke"],
    indexed_knowledge_ready: ["pnpm indexing:smoke", "pnpm index-quality:smoke", "pnpm release-gate:smoke"],
    latest_eval_gate: ["pnpm eval", "pnpm eval:cases-smoke", "pnpm release-gate:smoke"],
    knowledge_freshness: ["pnpm freshness:smoke", "pnpm release-gate:smoke"],
    slo_guardrails: ["pnpm observability:slo-smoke", "pnpm release-gate:smoke"],
    api_error_budget: ["pnpm error-budget:smoke", "pnpm observability:slo-smoke", "pnpm release-gate:smoke"],
    agent_audit_trail: ["pnpm trace:smoke", "pnpm question-audit:smoke", "pnpm release-gate:smoke"],
    approval_backlog: ["pnpm review:smoke", "pnpm release-gate:smoke"],
    feedback_signal: ["pnpm quality-gate:smoke", "pnpm release-gate:smoke"]
  };
  return commands[id] ?? ["pnpm release-gate:smoke"];
}

function releaseLinks(id: string): OperationalAction["links"] {
  const links: Record<string, OperationalAction["links"]> = {
    latest_eval_gate: [{ label: "평가 케이스", href: "/evaluations/cases" }],
    knowledge_freshness: [{ label: "배포 게이트", href: "/observability/release-gate" }],
    slo_guardrails: [{ label: "SLO API", href: "/observability/slo" }],
    api_error_budget: [{ label: "오류 예산 API", href: "/observability/error-budget" }],
    approval_backlog: [{ label: "승인 대기열", href: "/approvals" }],
    feedback_signal: [{ label: "피드백 API", href: "/feedback" }]
  };
  return links[id] ?? [{ label: "배포 게이트", href: "/observability/release-gate" }];
}

function sloActionTitle(id: string, fallback: string): string {
  const titles: Record<string, string> = {
    answer_grounding: "답변 근거성 SLO 복구",
    review_load: "사람 검토 부하 완화",
    tool_audit_coverage: "도구 감사 커버리지 복구",
    eval_gate: "평가 게이트 재실행",
    api_success_rate: "API 성공률 복구",
    api_error_budget: "API 오류 예산 복구"
  };
  return titles[id] ?? fallback;
}

function sloOwner(objective: SloObjective): ReleaseGateCheck["owner"] {
  const owners: Record<string, ReleaseGateCheck["owner"]> = {
    answer_grounding: "rag",
    review_load: "ops",
    tool_audit_coverage: "ops",
    eval_gate: "quality",
    api_success_rate: "platform",
    api_error_budget: "platform"
  };
  return owners[objective.id] ?? (objective.source === "api_requests" ? "platform" : "quality");
}

function sloImpact(id: string): string {
  const impacts: Record<string, string> = {
    answer_grounding: "답변과 근거 문서의 일치율이 낮으면 운영 채널 자동 공유가 위험합니다.",
    review_load: "검토 비율이 높으면 운영자가 AI Agent를 처리 큐처럼 써야 해서 자동화 효과가 줄어듭니다.",
    tool_audit_coverage: "도구 호출 증거가 빠지면 장애 대응과 권한 경계를 재현할 수 없습니다.",
    eval_gate: "평가 게이트가 실패하면 새 문서/프롬프트 변경의 회귀를 증명할 수 없습니다.",
    api_success_rate: "최근 API 5xx가 늘면 Slack/Web 사용자가 운영 답변을 안정적으로 받을 수 없습니다.",
    api_error_budget: "오류 예산이 소진되면 성공률 평균이 아직 괜찮아 보여도 배포 위험이 급격히 커집니다."
  };
  return impacts[id] ?? "SLO objective가 기준을 벗어나 release gate가 흔들릴 수 있습니다.";
}

function sloActionItems(objective: SloObjective): string[] {
  const items: Record<string, string[]> = {
    answer_grounding: ["근거성이 낮은 답변의 top source와 문서 일치율을 확인합니다.", "관련 문서의 제목, 별칭, 청크 크기를 보강합니다."],
    review_load: ["low confidence와 sensitive_action review reason 분포를 확인합니다.", "민감 작업은 승인 경계로 유지하되 일반 질문의 검색 품질을 보강합니다."],
    tool_audit_coverage: ["질문 저장 후 `search_documents` 로그가 누락되는 경로를 확인합니다.", "incident workflow는 질문 단위 audit bundle로 재검증합니다."],
    eval_gate: ["`pnpm eval`을 실행하고 실패 케이스의 기대 출처를 수정합니다.", "평가 케이스가 현재 문서 변경을 반영하는지 확인합니다."],
    api_success_rate: ["최근 24시간 endpoint별 5xx와 p95를 확인합니다.", "실패 endpoint의 입력 검증, DB 연결, Redis 연결을 우선 점검합니다."],
    api_error_budget: ["5분/1시간 burn rate가 24시간 평균보다 튀는지 확인합니다.", "`pnpm error-budget:smoke`로 회복 후 오류 예산이 정상인지 증명합니다."]
  };
  return items[objective.id] ?? ["SLO objective의 actual/target 차이를 확인합니다.", "수정 후 SLO smoke를 다시 실행합니다."];
}

function compareActions(left: OperationalAction, right: OperationalAction): number {
  const priorityOrder = { p0: 0, p1: 1, p2: 2 };
  return priorityOrder[left.priority] - priorityOrder[right.priority] || left.owner.localeCompare(right.owner) || left.id.localeCompare(right.id);
}

function buildReleaseGateChecks(input: {
  summary: ObservabilitySummary;
  slo: ObservabilitySloReport;
  readiness: ReadinessReport;
  latestEvalPassed: boolean;
  pendingApprovals: number;
  knowledgeFreshness: KnowledgeFreshness;
  errorBudget: ErrorBudgetReport;
}): ReleaseGateCheck[] {
  const minDocuments = readCountThreshold("RELEASE_MIN_DOCUMENTS", 5);
  const minChunks = readCountThreshold("RELEASE_MIN_CHUNKS", 8);
  const maxPendingApprovals = readCountThreshold("RELEASE_MAX_PENDING_APPROVALS", 25);
  const searchCalls = input.summary.toolCalls.byName.search_documents ?? 0;
  const approvalCalls = input.summary.toolCalls.byName.request_human_approval ?? 0;

  return [
    {
      id: "dependencies_ready",
      label: "의존성 준비",
      status: input.readiness.ok ? "pass" : "fail",
      evidence: `PostgreSQL=${input.readiness.dependencies.postgres.status}, Redis=${input.readiness.dependencies.redis.status}, Elasticsearch=${input.readiness.dependencies.elasticsearch.status}.`,
      owner: "platform"
    },
    {
      id: "indexed_knowledge_ready",
      label: "지식 베이스 색인 준비",
      status:
        input.summary.documents.total >= minDocuments && input.summary.documents.chunks >= minChunks
          ? "pass"
          : "fail",
      evidence: `문서 ${input.summary.documents.total}개와 청크 ${input.summary.documents.chunks}개가 색인됐습니다.`,
      owner: "rag",
      metric: input.summary.documents.chunks,
      threshold: minChunks
    },
    {
      id: "latest_eval_gate",
      label: "최신 평가 게이트",
      status: input.latestEvalPassed ? "pass" : "fail",
      evidence: input.latestEvalPassed
        ? "최신 seed-ops-wiki 평가가 통과했습니다."
        : "최신 seed-ops-wiki 평가가 없거나 실패했습니다.",
      owner: "quality"
    },
    {
      id: "knowledge_freshness",
      label: "지식 최신성",
      status: input.knowledgeFreshness.latestEvalCreatedAt
        ? input.knowledgeFreshness.stale
          ? "warn"
          : "pass"
        : "fail",
      evidence: freshnessEvidence(input.knowledgeFreshness),
      owner: "quality",
      metric: input.knowledgeFreshness.changedDocumentsSinceEval,
      threshold: 0
    },
    {
      id: "slo_guardrails",
      label: "SLO 가드레일",
      status: input.slo.status === "ok" ? "pass" : input.slo.status === "warn" ? "warn" : "fail",
      evidence: `SLO 목표 ${input.slo.objectives.length}개가 ${input.slo.status} 상태입니다.`,
      owner: "quality"
    },
    {
      id: "api_error_budget",
      label: "API 오류 예산",
      status:
        input.errorBudget.status === "healthy"
          ? "pass"
          : input.errorBudget.status === "watch"
            ? "warn"
            : "fail",
      evidence: `24시간 가용성 ${Math.round(input.errorBudget.summary.availability * 100)}%, 최악 burn rate ${input.errorBudget.summary.worstBurnRate}x, 권고 ${input.errorBudget.summary.releaseRecommendation}.`,
      owner: "platform",
      metric: input.errorBudget.summary.errorBudgetRemaining,
      threshold: 0
    },
    {
      id: "agent_audit_trail",
      label: "에이전트 감사 추적",
      status: searchCalls > 0 && approvalCalls > 0 ? "pass" : searchCalls > 0 ? "warn" : "fail",
      evidence: `search_documents=${searchCalls}, request_human_approval=${approvalCalls}.`,
      owner: "ops"
    },
    {
      id: "approval_backlog",
      label: "승인 대기열",
      status: input.pendingApprovals <= maxPendingApprovals ? "pass" : "warn",
      evidence: `대기 중인 승인 요청은 ${input.pendingApprovals}개이고 검토 기준은 ${maxPendingApprovals}개입니다.`,
      owner: "ops",
      metric: input.pendingApprovals,
      threshold: maxPendingApprovals
    },
    {
      id: "feedback_signal",
      label: "피드백 신호",
      status: input.summary.feedback.total > 0 ? "pass" : "warn",
      evidence:
        input.summary.feedback.total > 0
          ? `피드백 ${input.summary.feedback.total}개를 사용할 수 있습니다.`
          : "아직 저장된 피드백이 없습니다.",
      owner: "quality",
      metric: input.summary.feedback.total,
      threshold: 1
    }
  ];
}

function freshnessEvidence(freshness: KnowledgeFreshness): string {
  if (!freshness.latestEvalCreatedAt) {
    return "색인된 지식 베이스에 대한 seed-ops-wiki 평가가 아직 없습니다.";
  }

  if (freshness.stale) {
    return `최신 seed-ops-wiki 평가 이후 변경된 문서가 ${freshness.changedDocumentsSinceEval}개 있습니다.`;
  }

  return "최신 seed-ops-wiki 평가가 색인 문서보다 최신입니다.";
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

function ratioOrOne(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : roundMetric(numerator / denominator);
}

function roundMetric(value: number | string | null | undefined): number {
  return Number(toNumber(value).toFixed(3));
}

function toKnowledgeFreshness(row: KnowledgeFreshnessRow | undefined): KnowledgeFreshness {
  const latestEvalCreatedAt = toIsoStringOrNull(row?.latest_eval_created_at);
  const latestDocumentUpdatedAt = toIsoStringOrNull(row?.latest_document_updated_at);
  const changedDocumentsSinceEval = toNumber(row?.changed_documents_since_eval);

  return {
    latestEvalCreatedAt,
    latestDocumentUpdatedAt,
    changedDocumentsSinceEval,
    stale: changedDocumentsSinceEval > 0
  };
}

function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return toIsoString(value);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value);
}
