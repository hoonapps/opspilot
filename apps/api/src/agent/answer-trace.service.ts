import { Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";

export type AnswerTrace = {
  answer: {
    id: string;
    questionId: string;
    question: string;
    channel?: string | null;
    actor: Record<string, unknown>;
    text: string;
    confidence: number;
    needsHumanReview: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  sources: Array<{
    rank: number;
    score: number;
    documentId: string;
    chunkId: string;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    chunkIndex: number;
    contentPreview: string;
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
    reason: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
  feedback: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
  }>;
};

@Injectable()
export class AnswerTraceService {
  constructor(private readonly orm: MikroORM) {}

  async getTrace(answerId: string): Promise<AnswerTrace> {
    const connection = this.orm.em.fork().getConnection();
    const [answer] = (await connection.execute(
      `
        select
          a.id,
          a.question_id,
          q.text as question,
          q.channel,
          q.actor,
          a.text,
          a.confidence,
          a.needs_human_review,
          a.metadata,
          a.created_at
        from answers a
        join questions q on q.id = a.question_id
        where a.id = ?::uuid;
      `,
      [answerId]
    )) as AnswerTraceRow[];

    if (!answer) {
      throw new NotFoundException("Answer trace not found");
    }

    const [sources, toolCalls, approvals, feedback] = await Promise.all([
      connection.execute(
        `
          select
            s.rank,
            s.score,
            d.id as document_id,
            c.id as chunk_id,
            d.title,
            d.path,
            d.visibility,
            d.team_slug,
            c.chunk_index,
            left(c.content, 360) as content_preview
          from answer_sources s
          join documents d on d.id = s.document_id
          join document_chunks c on c.id = s.chunk_id
          where s.answer_id = ?::uuid
          order by s.rank asc;
        `,
        [answerId]
      ) as Promise<SourceTraceRow[]>,
      connection.execute(
        `
          select id, tool_name, status, input, output, created_at
          from tool_call_logs
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [answer.question_id]
      ) as Promise<ToolCallTraceRow[]>,
      connection.execute(
        `
          select id, action, reason, status, created_at
          from approval_requests
          where question_id = ?::uuid
          order by created_at asc;
        `,
        [answer.question_id]
      ) as Promise<ApprovalTraceRow[]>,
      connection.execute(
        `
          select id, rating, comment, created_at
          from feedback
          where answer_id = ?::uuid
          order by created_at asc;
        `,
        [answerId]
      ) as Promise<FeedbackTraceRow[]>
    ]);

    return {
      answer: {
        id: answer.id,
        questionId: answer.question_id,
        question: answer.question,
        channel: answer.channel,
        actor: answer.actor,
        text: answer.text,
        confidence: answer.confidence,
        needsHumanReview: answer.needs_human_review,
        metadata: answer.metadata,
        createdAt: toIsoString(answer.created_at)
      },
      sources: sources.map((source) => ({
        rank: source.rank,
        score: source.score,
        documentId: source.document_id,
        chunkId: source.chunk_id,
        title: source.title,
        path: source.path,
        visibility: source.visibility,
        teamSlug: source.team_slug,
        chunkIndex: source.chunk_index,
        contentPreview: source.content_preview
      })),
      toolCalls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        toolName: toolCall.tool_name,
        status: toolCall.status,
        input: toolCall.input,
        output: toolCall.output,
        createdAt: toIsoString(toolCall.created_at)
      })),
      approvals: approvals.map((approval) => ({
        id: approval.id,
        action: approval.action,
        reason: approval.reason,
        status: approval.status,
        createdAt: toIsoString(approval.created_at)
      })),
      feedback: feedback.map((item) => ({
        id: item.id,
        rating: item.rating,
        comment: item.comment,
        createdAt: toIsoString(item.created_at)
      }))
    };
  }
}

type AnswerTraceRow = {
  id: string;
  question_id: string;
  question: string;
  channel?: string | null;
  actor: Record<string, unknown>;
  text: string;
  confidence: number;
  needs_human_review: boolean;
  metadata: Record<string, unknown>;
  created_at: Date | string;
};

type SourceTraceRow = {
  rank: number;
  score: number;
  document_id: string;
  chunk_id: string;
  title: string;
  path: string;
  visibility: string;
  team_slug?: string | null;
  chunk_index: number;
  content_preview: string;
};

type ToolCallTraceRow = {
  id: string;
  tool_name: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  created_at: Date | string;
};

type ApprovalTraceRow = {
  id: string;
  action: string;
  reason: Record<string, unknown>;
  status: string;
  created_at: Date | string;
};

type FeedbackTraceRow = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
