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
  rows: Array<{
    id: string;
    hit: boolean;
    needsHumanReview: boolean;
    expectedSources: string[];
    actualSources: string[];
    confidence: number;
  }>;
};

export type LatestEvalReport = {
  suiteName: string;
  createdAt: string;
  total: number;
  metrics: {
    sourceHitRate: number;
    topSourceAccuracy: number;
    humanReviewAccuracy: number;
  };
  rows: EvalReport["rows"];
} | null;

type EvaluationMetricRow = {
  metric_name: string;
  score: number;
  details: { total?: number; rows?: EvalReport["rows"] };
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
      const hit = item.expectedSources.some((expected) => actualSources.includes(expected));
      rows.push({
        id: item.id,
        hit,
        needsHumanReview: response.needsHumanReview,
        expectedSources: item.expectedSources,
        actualSources,
        confidence: response.confidence
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

    const report: EvalReport = {
      suiteName,
      total: rows.length,
      sourceHitRate,
      topSourceAccuracy,
      humanReviewAccuracy,
      rows
    };

    await this.orm.em.fork().getConnection().execute(
      `
        insert into evaluation_results (suite_name, metric_name, score, details)
        values
          (?, 'source_hit_rate', ?, ?::jsonb),
          (?, 'top_source_accuracy', ?, ?::jsonb),
          (?, 'human_review_accuracy', ?, ?::jsonb);
      `,
      [
        suiteName,
        sourceHitRate,
        JSON.stringify({ total: rows.length, rows }),
        suiteName,
        topSourceAccuracy,
        JSON.stringify({ total: rows.length, rows }),
        suiteName,
        humanReviewAccuracy,
        JSON.stringify({ total: rows.length, rows })
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

    return {
      report: {
        suiteName,
        createdAt: createdAt.toISOString(),
        total: details.total ?? details.rows?.length ?? 0,
        metrics: {
          sourceHitRate: byMetric.get("source_hit_rate")?.score ?? 0,
          topSourceAccuracy: byMetric.get("top_source_accuracy")?.score ?? 0,
          humanReviewAccuracy: byMetric.get("human_review_accuracy")?.score ?? 0
        },
        rows: details.rows ?? []
      }
    };
  }
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : Number((value / total).toFixed(3));
}

function itemMatchesTopSource(expectedSources: string[], actualSources: string[]): boolean {
  const topSource = actualSources[0];
  return Boolean(topSource && expectedSources.includes(topSource));
}
