import { ApiProperty } from "@nestjs/swagger";

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
  type!: string;

  @ApiProperty({ required: false, example: "challenge-token" })
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
  event?: SlackEventCallbackPayload["event"];
}

export type SlackHandleResult = {
  ok: boolean;
  ignored?: boolean;
  reason?: string;
  challenge?: string;
  reply?: SlackThreadReply;
};

export type SlackThreadReply = {
  channel: string;
  threadTs: string;
  text: string;
  blocks: Array<Record<string, unknown>>;
};
