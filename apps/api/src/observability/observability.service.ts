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

  async slo(): Promise<ObservabilitySloReport> {
    const connection = this.orm.em.fork().getConnection();
    const [summary, latestEvalRows, toolCoverageRows, apiRequestRows] = await Promise.all([
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
      `)
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
    const [summary, slo, readiness, latestEvalRows, freshnessRows] = await Promise.all([
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
      `)
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
      knowledgeFreshness
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
    const [gate, slo] = await Promise.all([this.releaseGate(), this.slo()]);
    const releaseGateActions = gate.checks
      .filter((check) => check.status !== "pass")
      .map((check) => actionFromReleaseGateCheck(check, gate.status));
    const sloActions = slo.objectives
      .filter((objective) => objective.status !== "ok")
      .map((objective) => actionFromSloObjective(objective));
    const actions = [...releaseGateActions, ...sloActions];

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

function buildReleaseWatchAction(status: ReleaseGateStatus): OperationalAction {
  return {
    id: "release_watch",
    title: "배포 상태 유지 관찰",
    priority: "p2",
    owner: "quality",
    status: "watch",
    source: "operational_watch",
    sourceId: "release_gate",
    reason: `Release gate is ${status}.`,
    impact: "현재는 차단 액션이 없지만, 문서 변경이나 새 피드백 이후 품질 게이트가 stale해질 수 있습니다.",
    actionItems: [
      "배포 전 최신 평가와 웹 스모크를 다시 실행합니다.",
      "새 문서가 추가되면 검색 강건성 리포트와 문서 영향 분석을 확인합니다.",
      "민감 작업 승인 대기열이 증가하는지 확인합니다."
    ],
    verification: ["pnpm eval", "pnpm release-gate:smoke", "pnpm web:smoke"],
    links: [{ label: "Release gate", href: "/observability/release-gate" }]
  };
}

function releaseActionTitle(id: string, fallback: string): string {
  const titles: Record<string, string> = {
    dependencies_ready: "의존성 복구",
    indexed_knowledge_ready: "지식 베이스 색인 보강",
    latest_eval_gate: "최신 평가 게이트 복구",
    knowledge_freshness: "문서 변경 후 재평가",
    slo_guardrails: "SLO 위반 원인 제거",
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
    agent_audit_trail: `${severity}: tool calling 증거가 부족하면 운영 판단을 사후 재현할 수 없습니다.`,
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
    agent_audit_trail: ["pnpm trace:smoke", "pnpm question-audit:smoke", "pnpm release-gate:smoke"],
    approval_backlog: ["pnpm review:smoke", "pnpm release-gate:smoke"],
    feedback_signal: ["pnpm quality-gate:smoke", "pnpm release-gate:smoke"]
  };
  return commands[id] ?? ["pnpm release-gate:smoke"];
}

function releaseLinks(id: string): OperationalAction["links"] {
  const links: Record<string, OperationalAction["links"]> = {
    latest_eval_gate: [{ label: "Evaluation cases", href: "/evaluations/cases" }],
    knowledge_freshness: [{ label: "Release gate", href: "/observability/release-gate" }],
    slo_guardrails: [{ label: "SLO API", href: "/observability/slo" }],
    approval_backlog: [{ label: "Approvals", href: "/approvals" }],
    feedback_signal: [{ label: "Feedback API", href: "/feedback" }]
  };
  return links[id] ?? [{ label: "Release gate", href: "/observability/release-gate" }];
}

function sloActionTitle(id: string, fallback: string): string {
  const titles: Record<string, string> = {
    answer_grounding: "답변 근거성 SLO 복구",
    review_load: "사람 검토 부하 완화",
    tool_audit_coverage: "도구 감사 커버리지 복구",
    eval_gate: "평가 게이트 재실행",
    api_success_rate: "API 성공률 복구"
  };
  return titles[id] ?? fallback;
}

function sloOwner(objective: SloObjective): ReleaseGateCheck["owner"] {
  const owners: Record<string, ReleaseGateCheck["owner"]> = {
    answer_grounding: "rag",
    review_load: "ops",
    tool_audit_coverage: "ops",
    eval_gate: "quality",
    api_success_rate: "platform"
  };
  return owners[objective.id] ?? (objective.source === "api_requests" ? "platform" : "quality");
}

function sloImpact(id: string): string {
  const impacts: Record<string, string> = {
    answer_grounding: "답변과 근거 문서의 일치율이 낮으면 운영 채널 자동 공유가 위험합니다.",
    review_load: "검토 비율이 높으면 운영자가 AI Agent를 처리 큐처럼 써야 해서 자동화 효과가 줄어듭니다.",
    tool_audit_coverage: "도구 호출 증거가 빠지면 장애 대응과 권한 경계를 재현할 수 없습니다.",
    eval_gate: "평가 게이트가 실패하면 새 문서/프롬프트 변경의 회귀를 증명할 수 없습니다.",
    api_success_rate: "최근 API 5xx가 늘면 Slack/Web 사용자가 운영 답변을 안정적으로 받을 수 없습니다."
  };
  return impacts[id] ?? "SLO objective가 기준을 벗어나 release gate가 흔들릴 수 있습니다.";
}

function sloActionItems(objective: SloObjective): string[] {
  const items: Record<string, string[]> = {
    answer_grounding: ["근거성이 낮은 답변의 top source와 문서 일치율을 확인합니다.", "관련 문서의 제목, 별칭, 청크 크기를 보강합니다."],
    review_load: ["low confidence와 sensitive_action review reason 분포를 확인합니다.", "민감 작업은 승인 경계로 유지하되 일반 질문의 검색 품질을 보강합니다."],
    tool_audit_coverage: ["질문 저장 후 `search_documents` 로그가 누락되는 경로를 확인합니다.", "incident workflow는 질문 단위 audit bundle로 재검증합니다."],
    eval_gate: ["`pnpm eval`을 실행하고 실패 케이스의 기대 출처를 수정합니다.", "평가 케이스가 현재 문서 변경을 반영하는지 확인합니다."],
    api_success_rate: ["최근 24시간 endpoint별 5xx와 p95를 확인합니다.", "실패 endpoint의 입력 검증, DB 연결, Redis 연결을 우선 점검합니다."]
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
      id: "knowledge_freshness",
      label: "Knowledge freshness",
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

function freshnessEvidence(freshness: KnowledgeFreshness): string {
  if (!freshness.latestEvalCreatedAt) {
    return "No seed-ops-wiki evaluation exists for the indexed knowledge base.";
  }

  if (freshness.stale) {
    return `${freshness.changedDocumentsSinceEval} documents changed after the latest seed-ops-wiki evaluation.`;
  }

  return "Latest seed-ops-wiki evaluation is newer than the indexed documents.";
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
