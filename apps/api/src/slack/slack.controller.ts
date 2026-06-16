import { Body, Controller, Headers, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { SlackEventPayload } from "./dto/slack-event.dto";
import { SlackService } from "./slack.service";

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

@ApiTags("slack")
@Controller("slack")
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  @Post("events")
  async handleEvent(
    @Body() body: SlackEventPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: RawBodyRequest
  ) {
    if (!this.slackService.verifySignature(headers, request.rawBody)) {
      throw new UnauthorizedException("Invalid Slack signature");
    }

    if (body.type === "url_verification" && typeof body.challenge === "string") {
      return body.challenge;
    }

    return this.slackService.handlePayload(body);
  }
}
