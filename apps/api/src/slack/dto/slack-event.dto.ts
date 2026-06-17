import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export type SlackUrlVerificationPayload = {
  type: "url_verification";
  challenge: string;
};

export type SlackEventCallbackPayload = {
  type: "event_callback";
  team_id?: string;
  event: {
    type: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
  };
};

export class SlackEventPayload {
  @ApiProperty({ example: "event_callback", enum: ["url_verification", "event_callback"] })
  @IsString()
  type!: string;

  @ApiProperty({ required: false, example: "challenge-token" })
  @IsOptional()
  @IsString()
  challenge?: string;

  @ApiProperty({
    required: false,
    example: {
      type: "app_mention",
      user: "U123",
      text: "<@UOPS> E102 에러가 발생하면 어떻게 대응해야 해?",
      channel: "C123",
      ts: "1710000000.000100",
      thread_ts: "1710000000.000100"
    }
  })
  @IsOptional()
  @IsObject()
  event?: SlackEventCallbackPayload["event"];
}

export type SlackHandleResult = {
  ok: boolean;
  ignored?: boolean;
  reason?: string;
  challenge?: string;
  reply?: SlackThreadReply;
  trace?: SlackEventTrace;
};

export type SlackThreadReply = {
  channel: string;
  threadTs: string;
  text: string;
  blocks: Array<Record<string, unknown>>;
};

export type SlackEventTrace = {
  eventType: string;
  channel: string;
  threadTs: string;
  user?: string;
  actor: {
    actorId?: string;
    roles: string[];
    teamSlugs: string[];
  };
  question: string;
  questionId: string;
  answerId: string;
  needsHumanReview: boolean;
  reviewReasons: string[];
  sources: Array<{
    title: string;
    path: string;
    score: number;
  }>;
  toolCalls: Array<{
    toolName: string;
    status: string;
  }>;
  reply: {
    postMode: "dry_run" | "posted" | "failed";
    blockCount: number;
    textLength: number;
  };
};
