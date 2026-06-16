export type SlackEventPayload =
  | SlackUrlVerificationPayload
  | SlackEventCallbackPayload
  | Record<string, unknown>;

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
