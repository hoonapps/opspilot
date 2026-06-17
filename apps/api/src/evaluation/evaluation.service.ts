import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { AgentService } from "../agent/agent.service";
import { calculateDocumentAgreement } from "../agent/document-agreement";
import { RequestContext } from "../shared/request-context";

export type EvalQuestion = {
  id: string;
  question: string;
  expectedSources: string[];
  actor: RequestContext;
};

export type EvalReport = {
  suiteName: string;
  total: number;
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
  passed: boolean;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
  rows: Array<{
    id: string;
    hit: boolean;
    needsHumanReview: boolean;
    expectedSources: string[];
    actualSources: string[];
    confidence: number;
    documentAgreement: number;
    citationPresent: boolean;
  }>;
};

export type EvaluationThresholds = {
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
};

export type EvaluationGate = {
  metric: keyof EvaluationThresholds;
  score: number;
  threshold: number;
  passed: boolean;
};

export type LatestEvalReport = {
  suiteName: string;
  createdAt: string;
  total: number;
  passed: boolean;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
  metrics: {
    sourceHitRate: number;
    topSourceAccuracy: number;
    humanReviewAccuracy: number;
    documentAgreementScore: number;
    citationAccuracy: number;
  };
  rows: EvalReport["rows"];
} | null;

export type EvaluationHistoryItem = {
  runId: string;
  suiteName: string;
  createdAt: string;
  total: number;
  passed: boolean;
  metrics: EvaluationMetrics;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
  deltas: Partial<Record<keyof EvaluationMetrics, number | null>>;
};

export type EvaluationHistory = {
  suiteName: string;
  count: number;
  items: EvaluationHistoryItem[];
};

export type EvaluationCaseReport = {
  suiteName: string;
  runId: string;
  createdAt: string;
  total: number;
  summary: {
    passed: number;
    warning: number;
    failed: number;
    highRisk: number;
    lowestAgreement: number;
    missingCitation: number;
  };
  thresholds: EvaluationThresholds;
  cases: EvaluationCaseDetail[];
};

export type EvaluationCaseDetail = {
  id: string;
  status: "pass" | "warn" | "fail";
  riskLevel: "low" | "medium" | "high";
  expectedSources: string[];
  actualSources: string[];
  topSource: string | null;
  confidence: number;
  documentAgreement: number;
  needsHumanReview: boolean;
  citationPresent: boolean;
  checks: Array<{
    id: "source_hit" | "top_source" | "human_review" | "document_agreement" | "citation";
    label: string;
    status: "pass" | "warn" | "fail";
    metric?: number;
    threshold?: number;
    evidence: string;
  }>;
  recommendations: string[];
};

export type EvaluationMetrics = {
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
};

type EvaluationMetricRow = {
  metric_name: string;
  score: number;
  details: EvaluationMetricDetails;
  created_at: Date | string;
};

type EvaluationMetricDetails = {
  runId?: string;
  total?: number;
  rows?: EvalReport["rows"];
  thresholds?: EvaluationThresholds;
  gates?: EvaluationGate[];
  metrics?: EvaluationMetrics;
  passed?: boolean;
};

const METRIC_NAMES = {
  source_hit_rate: "sourceHitRate",
  top_source_accuracy: "topSourceAccuracy",
  human_review_accuracy: "humanReviewAccuracy",
  document_agreement_score: "documentAgreementScore",
  citation_accuracy: "citationAccuracy"
} as const;

type StoredMetricName = keyof typeof METRIC_NAMES;

@Injectable()
export class EvaluationService {
  constructor(
    private readonly orm: MikroORM,
    private readonly agent: AgentService
  ) {}

  async run(suiteName: string, questions: EvalQuestion[]): Promise<EvalReport> {
    const runId = randomUUID();
    const rows = [];
    for (const item of questions) {
      const response = await this.agent.ask(item.question, item.actor, "eval");
      const actualSources = response.sources.map((source) => source.path);
      const sourceContents = await this.loadSourceContents(response.sources.map((source) => source.chunkId));
      const hit = item.expectedSources.some((expected) => actualSources.includes(expected));
      const citationPresent = answerCitesReturnedSource(
        response.answer,
        response.sources.map((source) => ({ title: source.title, path: source.path }))
      );
      rows.push({
        id: item.id,
        hit,
        needsHumanReview: response.needsHumanReview,
        expectedSources: item.expectedSources,
        actualSources,
        confidence: response.confidence,
        documentAgreement: calculateDocumentAgreement(response.answer, sourceContents).score,
        citationPresent
      });
    }

    const sourceHitRate = ratio(rows.filter((row) => row.hit).length, rows.length);
    const topSourceAccuracy = ratio(
      rows.filter((row) => itemMatchesTopSource(row.expectedSources, row.actualSources)).length,
      rows.length
    );
    const humanReviewAccuracy = ratio(
      rows.filter((row) => {
        const restrictedExpected = row.expectedSources.some((source) => source.includes("restricted/"));
        return restrictedExpected ? row.needsHumanReview : true;
      }).length,
      rows.length
    );
    const documentAgreementScore = average(rows.map((row) => row.documentAgreement));
    const citationAccuracy = ratio(rows.filter((row) => row.citationPresent).length, rows.length);
    const metrics = {
      sourceHitRate,
      topSourceAccuracy,
      humanReviewAccuracy,
      documentAgreementScore,
      citationAccuracy
    };
    const thresholds = evaluationThresholdsFromEnv();
    const gates = buildEvaluationGates(metrics, thresholds);
    const passed = gates.every((gate) => gate.passed);

    const report: EvalReport = {
      suiteName,
      total: rows.length,
      sourceHitRate,
      topSourceAccuracy,
      humanReviewAccuracy,
      documentAgreementScore,
      citationAccuracy,
      passed,
      thresholds,
      gates,
      rows
    };
    const details = JSON.stringify({ runId, total: rows.length, rows, thresholds, gates, metrics, passed });

    await this.orm.em.fork().getConnection().execute(
      `
        insert into evaluation_results (suite_name, metric_name, score, details)
        values
          (?, 'source_hit_rate', ?, ?::jsonb),
          (?, 'top_source_accuracy', ?, ?::jsonb),
          (?, 'human_review_accuracy', ?, ?::jsonb),
          (?, 'document_agreement_score', ?, ?::jsonb),
          (?, 'citation_accuracy', ?, ?::jsonb);
      `,
      [
        suiteName,
        sourceHitRate,
        details,
        suiteName,
        topSourceAccuracy,
        details,
        suiteName,
        humanReviewAccuracy,
        details,
        suiteName,
        documentAgreementScore,
        details,
        suiteName,
        citationAccuracy,
        details
      ]
    );

    return report;
  }

  async latest(suiteName: string): Promise<{ report: LatestEvalReport }> {
    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select metric_name, score, details, created_at
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit 50;
      `,
      [suiteName]
    )) as EvaluationMetricRow[];

    if (rows.length === 0) {
      return { report: null };
    }

    const grouped = groupEvaluationRows(rows);
    const [runId, latestRows] = [...grouped.entries()].sort(
      ([, leftRows], [, rightRows]) => getNewestTimestamp(rightRows) - getNewestTimestamp(leftRows)
    )[0];
    const item = buildHistoryItem(suiteName, runId, latestRows);
    const details = normalizeDetails(getNewestRow(latestRows).details);

    return {
      report: {
        suiteName,
        createdAt: item.createdAt,
        total: item.total,
        passed: item.passed,
        thresholds: item.thresholds,
        gates: item.gates,
        metrics: item.metrics,
        rows: details.rows ?? []
      }
    };
  }

  async history(suiteName: string, limit = 8): Promise<EvaluationHistory> {
    const requestedLimit = Number.isFinite(limit) ? limit : 8;
    const boundedLimit = Math.max(1, Math.min(requestedLimit, 20));
    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select metric_name, score, details, created_at
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit ?;
      `,
      [suiteName, boundedLimit * 10]
    )) as EvaluationMetricRow[];

    const grouped = groupEvaluationRows(rows);

    const items = [...grouped.entries()]
      .map(([runId, groupRows]) => buildHistoryItem(suiteName, runId, groupRows))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, boundedLimit);

    return {
      suiteName,
      count: items.length,
      items: items.map((item, index) => ({
        ...item,
        deltas: buildMetricDeltas(item.metrics, items[index + 1]?.metrics)
      }))
    };
  }

  async cases(suiteName: string): Promise<{ report: EvaluationCaseReport | null }> {
    const latest = await this.latest(suiteName);
    if (!latest.report) {
      return { report: null };
    }

    const runId = await this.latestRunId(suiteName);
    const thresholds = latest.report.thresholds;
    const cases = latest.report.rows.map((row) => buildEvaluationCase(row, thresholds));

    return {
      report: {
        suiteName,
        runId,
        createdAt: latest.report.createdAt,
        total: cases.length,
        summary: {
          passed: cases.filter((item) => item.status === "pass").length,
          warning: cases.filter((item) => item.status === "warn").length,
          failed: cases.filter((item) => item.status === "fail").length,
          highRisk: cases.filter((item) => item.riskLevel === "high").length,
          lowestAgreement: cases.length > 0 ? Math.min(...cases.map((item) => item.documentAgreement)) : 0,
          missingCitation: cases.filter((item) => !item.citationPresent).length
        },
        thresholds,
        cases
      }
    };
  }

  private async loadSourceContents(chunkIds: string[]): Promise<string[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select content
        from document_chunks
        where id in (${chunkIds.map(() => "?::uuid").join(", ")});
      `,
      chunkIds
    )) as Array<{ content: string }>;

    return rows.map((row) => row.content);
  }

  private async latestRunId(suiteName: string): Promise<string> {
    const [row] = (await this.orm.em.fork().getConnection().execute(
      `
        select details
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit 1;
      `,
      [suiteName]
    )) as Array<{ details: EvaluationMetricDetails | string }>;

    return normalizeDetails(row?.details).runId ?? "unknown";
  }
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : Number((value / total).toFixed(3));
}

function itemMatchesTopSource(expectedSources: string[], actualSources: string[]): boolean {
  const topSource = actualSources[0];
  return Boolean(topSource && expectedSources.includes(topSource));
}

function evaluationThresholdsFromEnv(): EvaluationThresholds {
  return {
    sourceHitRate: readThreshold("EVAL_MIN_SOURCE_HIT_RATE", 1),
    topSourceAccuracy: readThreshold("EVAL_MIN_TOP_SOURCE_ACCURACY", 1),
    humanReviewAccuracy: readThreshold("EVAL_MIN_HUMAN_REVIEW_ACCURACY", 1),
    documentAgreementScore: readThreshold("EVAL_MIN_DOCUMENT_AGREEMENT_SCORE", 0.8),
    citationAccuracy: readThreshold("EVAL_MIN_CITATION_ACCURACY", 1)
  };
}

function buildEvaluationGates(metrics: EvaluationThresholds, thresholds: EvaluationThresholds): EvaluationGate[] {
  return (Object.keys(thresholds) as Array<keyof EvaluationThresholds>).map((metric) => ({
    metric,
    score: metrics[metric],
    threshold: thresholds[metric],
    passed: metrics[metric] >= thresholds[metric]
  }));
}

function readThreshold(name: string, fallback: number): number {
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

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function answerCitesReturnedSource(answer: string, sources: Array<{ title: string; path: string }>): boolean {
  const normalizedAnswer = normalizeCitationText(answer);
  return sources.some((source) => {
    const title = normalizeCitationText(source.title);
    const path = normalizeCitationText(source.path);
    return (title.length > 0 && normalizedAnswer.includes(title)) || (path.length > 0 && normalizedAnswer.includes(path));
  });
}

function normalizeCitationText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildHistoryItem(suiteName: string, runId: string, rows: EvaluationMetricRow[]): EvaluationHistoryItem {
  const newestRow = getNewestRow(rows);
  const details = normalizeDetails(newestRow.details);
  const metrics = details.metrics ?? metricsFromRows(rows) ?? metricsFromGates(details.gates) ?? emptyMetrics();
  const thresholds = details.thresholds ?? evaluationThresholdsFromEnv();
  const gates = details.gates ?? buildEvaluationGates(metrics, thresholds);

  return {
    runId,
    suiteName,
    createdAt: new Date(newestRow.created_at).toISOString(),
    total: details.total ?? details.rows?.length ?? 0,
    passed: details.passed ?? gates.every((gate) => gate.passed),
    metrics,
    thresholds,
    gates,
    deltas: {}
  };
}

function groupEvaluationRows(rows: EvaluationMetricRow[]): Map<string, EvaluationMetricRow[]> {
  const grouped = new Map<string, EvaluationMetricRow[]>();
  for (const row of rows) {
    row.details = normalizeDetails(row.details);
    const runKey = row.details.runId ?? new Date(row.created_at).toISOString();
    grouped.set(runKey, [...(grouped.get(runKey) ?? []), row]);
  }

  return grouped;
}

function getNewestRow(rows: EvaluationMetricRow[]): EvaluationMetricRow {
  return rows.reduce((latest, row) => (new Date(row.created_at) > new Date(latest.created_at) ? row : latest), rows[0]);
}

function getNewestTimestamp(rows: EvaluationMetricRow[]): number {
  return new Date(getNewestRow(rows).created_at).getTime();
}

function normalizeDetails(details: EvaluationMetricDetails | string | null | undefined): EvaluationMetricDetails {
  if (!details) {
    return {};
  }

  if (typeof details === "string") {
    return JSON.parse(details) as EvaluationMetricDetails;
  }

  return details;
}

function metricsFromRows(rows: EvaluationMetricRow[]): EvaluationMetrics | null {
  const metrics = emptyMetrics();
  let found = 0;
  for (const row of rows) {
    const metricName = METRIC_NAMES[row.metric_name as StoredMetricName];
    if (metricName) {
      metrics[metricName] = Number(row.score);
      found += 1;
    }
  }

  return found > 0 ? metrics : null;
}

function metricsFromGates(gates?: EvaluationGate[]): EvaluationMetrics | null {
  if (!gates || gates.length === 0) {
    return null;
  }

  const metrics = emptyMetrics();
  for (const gate of gates) {
    metrics[gate.metric] = gate.score;
  }

  return metrics;
}

function emptyMetrics(): EvaluationMetrics {
  return {
    sourceHitRate: 0,
    topSourceAccuracy: 0,
    humanReviewAccuracy: 0,
    documentAgreementScore: 0,
    citationAccuracy: 0
  };
}

function buildMetricDeltas(
  current: EvaluationMetrics,
  previous?: EvaluationMetrics
): Partial<Record<keyof EvaluationMetrics, number | null>> {
  return (Object.keys(current) as Array<keyof EvaluationMetrics>).reduce<Partial<Record<keyof EvaluationMetrics, number | null>>>(
    (deltas, metric) => ({
      ...deltas,
      [metric]: previous ? Number((current[metric] - previous[metric]).toFixed(3)) : null
    }),
    {}
  );
}

function buildEvaluationCase(row: EvalReport["rows"][number], thresholds: EvaluationThresholds): EvaluationCaseDetail {
  const restrictedExpected = row.expectedSources.some((source) => source.includes("restricted/"));
  const topSource = row.actualSources[0] ?? null;
  const checks: EvaluationCaseDetail["checks"] = [
    {
      id: "source_hit",
      label: "기대 출처 적중",
      status: row.hit ? "pass" : "fail",
      evidence: row.hit
        ? "반환 출처에 기대 문서가 포함됐습니다."
        : `기대 출처 ${row.expectedSources.join(", ")}를 찾지 못했습니다.`
    },
    {
      id: "top_source",
      label: "1순위 출처 정확도",
      status: topSource && row.expectedSources.includes(topSource) ? "pass" : row.hit ? "warn" : "fail",
      evidence: topSource
        ? `1순위 출처는 ${topSource}입니다.`
        : "반환된 출처가 없습니다."
    },
    {
      id: "human_review",
      label: "사람 검토 경계",
      status: restrictedExpected ? (row.needsHumanReview ? "pass" : "fail") : "pass",
      evidence: restrictedExpected
        ? row.needsHumanReview
          ? "제한 문서 기대 케이스에서 사람 검토가 켜졌습니다."
          : "제한 문서 기대 케이스인데 사람 검토가 켜지지 않았습니다."
        : row.needsHumanReview
          ? "제한 문서 기대 케이스가 아니므로 사람 검토 여부는 실패 조건이 아닙니다."
          : "추가 사람 검토가 필요하지 않습니다."
    },
    {
      id: "document_agreement",
      label: "문서 일치율",
      status: row.documentAgreement >= thresholds.documentAgreementScore ? "pass" : row.documentAgreement >= thresholds.documentAgreementScore * 0.8 ? "warn" : "fail",
      metric: row.documentAgreement,
      threshold: thresholds.documentAgreementScore,
      evidence: `답변과 근거 문서의 토큰 일치율은 ${formatPercent(row.documentAgreement)}입니다.`
    },
    {
      id: "citation",
      label: "출처 인용",
      status: row.citationPresent ? "pass" : "fail",
      evidence: row.citationPresent ? "답변 본문이 반환 출처를 직접 인용합니다." : "답변 본문에서 반환 출처 인용을 찾지 못했습니다."
    }
  ];
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;

  return {
    id: row.id,
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass",
    riskLevel: failCount >= 2 || !row.hit ? "high" : failCount === 1 || warnCount > 0 ? "medium" : "low",
    expectedSources: row.expectedSources,
    actualSources: row.actualSources,
    topSource,
    confidence: row.confidence,
    documentAgreement: row.documentAgreement,
    needsHumanReview: row.needsHumanReview,
    citationPresent: row.citationPresent,
    checks,
    recommendations: buildCaseRecommendations(row, checks)
  };
}

function buildCaseRecommendations(row: EvalReport["rows"][number], checks: EvaluationCaseDetail["checks"]): string[] {
  const recommendations = checks.flatMap((check) => {
    if (check.status === "pass") {
      return [];
    }
    if (check.id === "source_hit") {
      return ["기대 문서의 제목, 별칭, 운영 키워드를 보강하거나 청킹 결과를 확인하세요."];
    }
    if (check.id === "top_source") {
      return ["검색 랭킹 가중치와 문서별 중복 청크를 점검해 기대 문서가 1순위로 오도록 조정하세요."];
    }
    if (check.id === "human_review") {
      return ["제한 문서 또는 민감 작업 질문의 검토 사유와 승인 경계 조건을 확인하세요."];
    }
    if (check.id === "document_agreement") {
      return ["답변 템플릿이 근거 문서 밖 표현을 과하게 만들지 않는지 확인하고 근거 스니펫을 늘리세요."];
    }
    if (check.id === "citation") {
      return ["답변 생성 템플릿에 출처 제목 또는 경로를 명시적으로 포함시키세요."];
    }
    return [];
  });

  return [...new Set(recommendations)].slice(0, 4);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
