import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { RequestContext } from "../shared/request-context";
import { removeAgreementBoilerplate, tokenizeForAgreement } from "./document-agreement";

export type AnswerTrace = {
  summary: {
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    needsHumanReview: boolean;
    confidence: number;
    documentAgreementScore: number;
    durationMs: number;
    coveredAnswerTokenCount: number;
    answerTokenCount: number;
  };
  grounding: {
    method: "source_token_overlap_v1";
    answerTokenCount: number;
    coveredAnswerTokenCount: number;
    coverageRatio: number;
    sources: Array<{
      rank: number;
      path: string;
      title: string;
      coverageRatio: number;
      matchedTokenCount: number;
      answerTokenCount: number;
      matchedTokens: string[];
    }>;
  };
  timeline: Array<{
    order: number;
    kind: "question" | "retrieval" | "answer" | "tool" | "approval" | "feedback";
    title: string;
    status: string;
    at: string;
    detail: Record<string, unknown>;
  }>;
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
  constructor(
    private readonly orm: MikroORM,
    private readonly authz: AuthzService
  ) {}

  async getTrace(answerId: string, context: RequestContext): Promise<AnswerTrace> {
    const connection = this.orm.em.fork().getConnection();
    const [answer] = (await connection.execute(
      `
        select
          a.id,
          a.question_id,
          q.text as question,
          q.channel,
          q.actor,
          q.created_at as question_created_at,
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
            c.content,
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

    const deniedSources = sources.filter((source) => !this.authz.canAccessDocument(context, source.visibility, source.team_slug));
    if (deniedSources.length > 0) {
      throw new ForbiddenException("Answer trace contains sources that are not accessible to this actor");
    }

    const questionCreatedAt = toIsoString(answer.question_created_at);
    const answerCreatedAt = toIsoString(answer.created_at);
    const mappedToolCalls = toolCalls.map((toolCall) => ({
      id: toolCall.id,
      toolName: toolCall.tool_name,
      status: toolCall.status,
      input: toolCall.input,
      output: toolCall.output,
      createdAt: toIsoString(toolCall.created_at)
    }));
    const mappedApprovals = approvals.map((approval) => ({
      id: approval.id,
      action: approval.action,
      reason: approval.reason,
      status: approval.status,
      createdAt: toIsoString(approval.created_at)
    }));
    const mappedFeedback = feedback.map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      createdAt: toIsoString(item.created_at)
    }));
    const metadata = answer.metadata ?? {};
    const documentAgreement = metadata.documentAgreement as { score?: unknown } | undefined;
    const grounding = buildGrounding(answer.text, sources);
    const summary = {
      sourceCount: sources.length,
      toolCallCount: mappedToolCalls.length,
      approvalCount: mappedApprovals.length,
      feedbackCount: mappedFeedback.length,
      needsHumanReview: answer.needs_human_review,
      confidence: answer.confidence,
      documentAgreementScore: typeof documentAgreement?.score === "number" ? documentAgreement.score : 0,
      durationMs: calculateDurationMs(questionCreatedAt, [
        answerCreatedAt,
        ...mappedToolCalls.map((event) => event.createdAt),
        ...mappedApprovals.map((event) => event.createdAt),
        ...mappedFeedback.map((event) => event.createdAt)
      ]),
      coveredAnswerTokenCount: grounding.coveredAnswerTokenCount,
      answerTokenCount: grounding.answerTokenCount
    };

    return {
      summary,
      grounding,
      timeline: buildTimeline({
        answerId: answer.id,
        questionId: answer.question_id,
        question: answer.question,
        questionCreatedAt,
        answerCreatedAt,
        summary,
        sources,
        toolCalls: mappedToolCalls,
        approvals: mappedApprovals,
        feedback: mappedFeedback
      }),
      answer: {
        id: answer.id,
        questionId: answer.question_id,
        question: answer.question,
        channel: answer.channel,
        actor: answer.actor,
        text: answer.text,
        confidence: answer.confidence,
        needsHumanReview: answer.needs_human_review,
        metadata,
        createdAt: answerCreatedAt
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
      toolCalls: mappedToolCalls,
      approvals: mappedApprovals,
      feedback: mappedFeedback
    };
  }
}

type AnswerTraceRow = {
  id: string;
  question_id: string;
  question: string;
  channel?: string | null;
  actor: Record<string, unknown>;
  question_created_at: Date | string;
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
  content: string;
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

function calculateDurationMs(start: string, eventTimes: string[]): number {
  const startMs = new Date(start).getTime();
  const endMs = Math.max(startMs, ...eventTimes.map((value) => new Date(value).getTime()));
  return Math.max(0, endMs - startMs);
}

function buildGrounding(answerText: string, sources: SourceTraceRow[]): AnswerTrace["grounding"] {
  const answerTokens = [...new Set(tokenizeForAgreement(removeAgreementBoilerplate(answerText)))];
  const sourceMatches = sources.map((source) => {
    const sourceTokens = new Set(tokenizeForAgreement(source.content));
    const matchedTokens = answerTokens.filter((token) => sourceTokens.has(token));
    return {
      matchedTokens,
      rank: source.rank,
      path: source.path,
      title: source.title,
      coverageRatio: ratio(matchedTokens.length, answerTokens.length),
      matchedTokenCount: matchedTokens.length,
      answerTokenCount: answerTokens.length
    };
  });
  const coveredTokens = new Set(sourceMatches.flatMap((source) => source.matchedTokens));

  return {
    method: "source_token_overlap_v1",
    answerTokenCount: answerTokens.length,
    coveredAnswerTokenCount: coveredTokens.size,
    coverageRatio: ratio(coveredTokens.size, answerTokens.length),
    sources: sourceMatches.map((source) => ({
      rank: source.rank,
      path: source.path,
      title: source.title,
      coverageRatio: source.coverageRatio,
      matchedTokenCount: source.matchedTokenCount,
      answerTokenCount: source.answerTokenCount,
      matchedTokens: source.matchedTokens.slice(0, 12)
    }))
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(3));
}

function buildTimeline(input: {
  answerId: string;
  questionId: string;
  question: string;
  questionCreatedAt: string;
  answerCreatedAt: string;
  summary: AnswerTrace["summary"];
  sources: SourceTraceRow[];
  toolCalls: AnswerTrace["toolCalls"];
  approvals: AnswerTrace["approvals"];
  feedback: AnswerTrace["feedback"];
}): AnswerTrace["timeline"] {
  const events: AnswerTrace["timeline"] = [
    {
      order: 1,
      kind: "question",
      title: "Question persisted",
      status: "created",
      at: input.questionCreatedAt,
      detail: {
        questionId: input.questionId,
        question: input.question
      }
    },
    {
      order: 2,
      kind: "retrieval",
      title: "Sources attached",
      status: input.sources.length > 0 ? "grounded" : "empty",
      at: input.answerCreatedAt,
      detail: {
        sourceCount: input.sources.length,
        topSource: input.sources[0]?.path ?? null,
        topScore: input.sources[0]?.score ?? null
      }
    },
    {
      order: 3,
      kind: "answer",
      title: "Answer generated",
      status: input.summary.needsHumanReview ? "needs_review" : "auto",
      at: input.answerCreatedAt,
      detail: {
        answerId: input.answerId,
        confidence: input.summary.confidence,
        documentAgreementScore: input.summary.documentAgreementScore,
        durationMs: input.summary.durationMs
      }
    },
    ...input.toolCalls.map((toolCall, index) => ({
      order: 10 + index,
      kind: "tool" as const,
      title: toolCall.toolName,
      status: toolCall.status,
      at: toolCall.createdAt,
      detail: {
        input: toolCall.input,
        output: toolCall.output
      }
    })),
    ...input.approvals.map((approval, index) => ({
      order: 100 + index,
      kind: "approval" as const,
      title: approval.action,
      status: approval.status,
      at: approval.createdAt,
      detail: {
        reason: approval.reason
      }
    })),
    ...input.feedback.map((item, index) => ({
      order: 200 + index,
      kind: "feedback" as const,
      title: "Feedback saved",
      status: item.rating > 0 ? "helpful" : "needs_work",
      at: item.createdAt,
      detail: {
        rating: item.rating,
        comment: item.comment ?? null
      }
    }))
  ];

  return events.sort((a, b) => {
    const timeDiff = new Date(a.at).getTime() - new Date(b.at).getTime();
    return timeDiff === 0 ? a.order - b.order : timeDiff;
  });
}
