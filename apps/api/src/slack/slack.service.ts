import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { AgentService } from "../agent/agent.service";
import { RequestContext } from "../shared/request-context";
import {
  SlackEventCallbackPayload,
  SlackEventPayload,
  SlackEventTrace,
  SlackHandleResult,
  SlackThreadReply
} from "./dto/slack-event.dto";

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private readonly agentService: AgentService) {}

  verifySignature(headers: Record<string, string | string[] | undefined>, rawBody?: Buffer): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      return true;
    }

    const timestamp = readHeader(headers, "x-slack-request-timestamp");
    const signature = readHeader(headers, "x-slack-signature");
    if (!timestamp || !signature || !rawBody) {
      return false;
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) {
      return false;
    }

    const expected = `v0=${createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody.toString("utf8")}`)
      .digest("hex")}`;

    return safeEqual(expected, signature);
  }

  async handlePayload(payload: SlackEventPayload): Promise<SlackHandleResult> {
    if (payload.type === "url_verification" && typeof payload.challenge === "string") {
      return { ok: true, challenge: payload.challenge };
    }

    if (!isEventCallbackPayload(payload)) {
      return { ok: true, ignored: true, reason: "unsupported_payload" };
    }

    const event = payload.event;
    if (event.type !== "app_mention") {
      return { ok: true, ignored: true, reason: "unsupported_event" };
    }

    if (event.bot_id) {
      return { ok: true, ignored: true, reason: "bot_message" };
    }

    const question = extractQuestion(event.text ?? "");
    if (!question) {
      return { ok: true, ignored: true, reason: "empty_question" };
    }

    const context = slackActorContext(event.user);
    const answer = await this.agentService.ask(question, context, "slack");
    const reply = buildReply({
      channel: event.channel ?? "",
      threadTs: event.thread_ts ?? event.ts ?? "",
      question,
      answer
    });

    const postMode = await this.postReplyIfEnabled(reply);

    return {
      ok: true,
      reply,
      trace: buildTrace({
        event,
        question,
        context,
        answer,
        reply,
        postMode
      })
    };
  }

  private async postReplyIfEnabled(reply: SlackThreadReply): Promise<SlackEventTrace["reply"]["postMode"]> {
    if (process.env.SLACK_POST_REPLIES !== "true") {
      return "dry_run";
    }

    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      this.logger.warn("SLACK_POST_REPLIES=true but SLACK_BOT_TOKEN is empty");
      return "failed";
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: reply.channel,
        thread_ts: reply.threadTs,
        text: reply.text,
        blocks: reply.blocks,
        unfurl_links: false,
        unfurl_media: false
      })
    });

    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!json.ok) {
      this.logger.warn(`Slack postMessage failed: ${json.error ?? response.statusText}`);
      return "failed";
    }

    return "posted";
  }
}

function isEventCallbackPayload(payload: SlackEventPayload): payload is SlackEventCallbackPayload {
  return (
    payload.type === "event_callback" &&
    typeof (payload as SlackEventCallbackPayload).event?.type === "string"
  );
}

function extractQuestion(text: string): string {
  return text.replace(/<@[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slackActorContext(user?: string): RequestContext {
  return {
    actorId: user,
    roles: splitEnv(process.env.SLACK_DEFAULT_ROLES),
    teamSlugs: splitEnv(process.env.SLACK_DEFAULT_TEAM_SLUGS ?? "payments")
  };
}

function buildReply(input: {
  channel: string;
  threadTs: string;
  question: string;
  answer: Awaited<ReturnType<AgentService["ask"]>>;
}): SlackThreadReply {
  const sourceLines = input.answer.sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.title} - ${source.path} (${source.score.toFixed(3)})`)
    .join("\n");
  const reviewText = input.answer.needsHumanReview ? "사람 검토 필요" : "자동 답변";
  const reasonText = formatReviewReasons(input.answer.reviewReasons);
  const toolText = input.answer.toolCalls.map((tool) => `${tool.toolName}: ${tool.status}`).join("\n");

  const text = `${input.answer.answer}\n\n출처:\n${sourceLines || "출처 없음"}\n\n${reviewText}${reasonText ? `\n검토 사유: ${reasonText}` : ""}`;

  return {
    channel: input.channel,
    threadTs: input.threadTs,
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*OpsPilot 답변*\n>${input.question}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: input.answer.answer
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*신뢰도*\n${input.answer.confidence.toFixed(3)}`
          },
          {
            type: "mrkdwn",
            text: `*검토 상태*\n${reviewText}${reasonText ? `\n${reasonText}` : ""}`
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*출처*\n${sourceLines || "출처 없음"}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `도구 호출: ${toolText || "없음"}`
          }
        ]
      }
    ]
  };
}

function buildTrace(input: {
  event: SlackEventCallbackPayload["event"];
  question: string;
  context: RequestContext;
  answer: Awaited<ReturnType<AgentService["ask"]>>;
  reply: SlackThreadReply;
  postMode: SlackEventTrace["reply"]["postMode"];
}): SlackEventTrace {
  return {
    eventType: input.event.type,
    channel: input.event.channel ?? "",
    threadTs: input.event.thread_ts ?? input.event.ts ?? "",
    user: input.event.user,
    actor: {
      actorId: input.context.actorId,
      roles: input.context.roles,
      teamSlugs: input.context.teamSlugs
    },
    question: input.question,
    questionId: input.answer.questionId,
    answerId: input.answer.answerId,
    needsHumanReview: input.answer.needsHumanReview,
    reviewReasons: input.answer.reviewReasons.map((reason) => reason.code),
    sources: input.answer.sources.map((source) => ({
      title: source.title,
      path: source.path,
      score: source.score
    })),
    toolCalls: input.answer.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      status: toolCall.status
    })),
    reply: {
      postMode: input.postMode,
      blockCount: input.reply.blocks.length,
      textLength: input.reply.text.length
    }
  };
}

function formatReviewReasons(reasons: Awaited<ReturnType<AgentService["ask"]>>["reviewReasons"]): string {
  return reasons.map((reason) => reason.code).join(", ");
}

function readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function splitEnv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
