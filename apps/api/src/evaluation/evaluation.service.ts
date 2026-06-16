import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AgentService } from "../agent/agent.service";
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
  }>;
};

export type EvaluationThresholds = {
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
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
      rows.push({
        id: item.id,
        hit,
        needsHumanReview: response.needsHumanReview,
        expectedSources: item.expectedSources,
        actualSources,
        confidence: response.confidence,
        documentAgreement: calculateDocumentAgreement(response.answer, sourceContents)
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
    const thresholds = evaluationThresholdsFromEnv();
    const gates = buildEvaluationGates(
      {
        sourceHitRate,
        topSourceAccuracy,
        humanReviewAccuracy,
        documentAgreementScore
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
          (?, 'document_agreement_score', ?, ?::jsonb);
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
      documentAgreementScore: byMetric.get("document_agreement_score")?.score ?? 0
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
    documentAgreementScore: readThreshold("EVAL_MIN_DOCUMENT_AGREEMENT_SCORE", 0.8)
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

function calculateDocumentAgreement(answer: string, sourceContents: string[]): number {
  const answerTokens = new Set(tokenizeForAgreement(removeEvaluationBoilerplate(answer)));
  if (answerTokens.size === 0) {
    return sourceContents.length === 0 ? 1 : 0;
  }

  const sourceTokens = new Set(sourceContents.flatMap((content) => tokenizeForAgreement(content)));
  const matched = [...answerTokens].filter((token) => sourceTokens.has(token)).length;
  return Number((matched / answerTokens.size).toFixed(3));
}

function removeEvaluationBoilerplate(answer: string): string {
  return answer
    .split(/\n+/)
    .filter((line) => !/^\s*근거\s*:/u.test(line))
    .filter((line) => !/신뢰도가 낮거나 민감 작업이 포함되어 담당자 확인이 필요합니다/u.test(line))
    .filter((line) => !/운영 DB 변경, 권한 부여, 삭제 같은 민감 작업은 Agent가 직접 실행하지 않고 승인 요청으로 분리합니다/u.test(line))
    .join(" ");
}

function tokenizeForAgreement(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .map((token) => stripParticle(token.trim()))
    .filter((token) => token.length >= 2)
    .filter((token) => !AGREEMENT_STOPWORDS.has(token));
}

function stripParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}

const AGREEMENT_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "must",
  "when",
  "what",
  "how",
  "are",
  "should",
  "해야",
  "어떻게",
  "무엇",
  "필요",
  "확인"
]);
