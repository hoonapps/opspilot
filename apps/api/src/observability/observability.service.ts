import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";

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

@Injectable()
export class ObservabilityService {
  constructor(private readonly orm: MikroORM) {}

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
