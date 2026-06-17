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
