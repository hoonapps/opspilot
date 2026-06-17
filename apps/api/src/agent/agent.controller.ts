import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { AgentService } from "./agent.service";
import { AskDto } from "./dto/ask.dto";
import { RateLimitService } from "./rate-limit.service";
import { RetrievalPreviewDto } from "./dto/retrieval-preview.dto";

@ApiTags("agent")
@Controller()
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly rateLimitService: RateLimitService
  ) {}

  @Post("ask")
  async ask(@Body() body: AskDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    const context = parseRequestContext(headers);
    await this.rateLimitService.enforceAskLimit(context);
    return this.agentService.ask(body.question, context, body.channel);
  }

  @Post("retrieval/preview")
  previewRetrieval(@Body() body: RetrievalPreviewDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.agentService.previewRetrieval(body.question, parseRequestContext(headers), body.limit);
  }
}
