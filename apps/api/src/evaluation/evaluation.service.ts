import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
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

type EvaluationMetricRow = {
  metric_name: string;
  score: number;
  details: { total?: number; rows?: EvalReport["rows"]; thresholds?: EvaluationThresholds; gates?: EvaluationGate[]; passed?: boolean };
  created_at: Date | string;
};

@Injectable()
export class EvaluationService {
  constructor(
    private readonly orm: MikroORM,
    private readonly agent: AgentService
  ) {}

  async run(suiteName: string, questions: EvalQuestion[]): Promise<EvalReport> {
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
    const thresholds = evaluationThresholdsFromEnv();
    const gates = buildEvaluationGates(
      {
        sourceHitRate,
        topSourceAccuracy,
        humanReviewAccuracy,
        documentAgreementScore,
        citationAccuracy
      },
      thresholds
    );
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
    const details = JSON.stringify({ total: rows.length, rows, thresholds, gates, passed });

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
        select distinct on (metric_name)
          metric_name,
          score,
          details,
          created_at
        from evaluation_results
        where suite_name = ?
        order by metric_name, created_at desc;
      `,
      [suiteName]
    )) as EvaluationMetricRow[];

    if (rows.length === 0) {
      return { report: null };
    }

    const byMetric = new Map(rows.map((row) => [row.metric_name, row]));
    const details = byMetric.get("source_hit_rate")?.details ?? rows[0].details;
    const createdAt = rows
      .map((row) => new Date(row.created_at))
      .reduce((latest, value) => (value > latest ? value : latest), new Date(rows[0].created_at));
    const metrics = {
      sourceHitRate: byMetric.get("source_hit_rate")?.score ?? 0,
      topSourceAccuracy: byMetric.get("top_source_accuracy")?.score ?? 0,
      humanReviewAccuracy: byMetric.get("human_review_accuracy")?.score ?? 0,
      documentAgreementScore: byMetric.get("document_agreement_score")?.score ?? 0,
      citationAccuracy: byMetric.get("citation_accuracy")?.score ?? 0
    };
    const thresholds = details.thresholds ?? evaluationThresholdsFromEnv();
    const gates = details.gates ?? buildEvaluationGates(metrics, thresholds);

    return {
      report: {
        suiteName,
        createdAt: createdAt.toISOString(),
        total: details.total ?? details.rows?.length ?? 0,
        passed: details.passed ?? gates.every((gate) => gate.passed),
        thresholds,
        gates,
        metrics,
        rows: details.rows ?? []
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
