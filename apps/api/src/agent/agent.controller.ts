import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { AgentService } from "./agent.service";
import { AskDto } from "./dto/ask.dto";
import { RetrievalPreviewDto } from "./dto/retrieval-preview.dto";

@ApiTags("agent")
@Controller()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("ask")
  ask(@Body() body: AskDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.agentService.ask(body.question, parseRequestContext(headers), body.channel);
  }

  @Post("retrieval/preview")
  previewRetrieval(@Body() body: RetrievalPreviewDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.agentService.previewRetrieval(body.question, parseRequestContext(headers), body.limit);
  }
}
