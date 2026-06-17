import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { AgentService } from "./agent.service";
import { AskIdempotencyService } from "./ask-idempotency.service";
import { AskDto } from "./dto/ask.dto";
import { IncidentPlanDto } from "./dto/incident-plan.dto";
import { RateLimitService } from "./rate-limit.service";
import { RetrievalPermissionDiffDto } from "./dto/retrieval-permission-diff.dto";
import { RetrievalPreviewDto } from "./dto/retrieval-preview.dto";
import { RetrievalRobustnessDto } from "./dto/retrieval-robustness.dto";
import { IncidentResponsePlanService } from "./incident-response-plan.service";

@ApiTags("agent")
@Controller()
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly askIdempotencyService: AskIdempotencyService,
    private readonly incidentResponsePlanService: IncidentResponsePlanService,
    private readonly rateLimitService: RateLimitService
  ) {}

  @Post("ask")
  @ApiHeader({
    name: "x-idempotency-key",
    required: false,
    description: "Optional actor-scoped key that replays the same /ask response for safe retries."
  })
  async ask(@Body() body: AskDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    const context = parseRequestContext(headers);
    const idempotencyKey = readHeader(headers, "x-idempotency-key");
    const runAsk = async () => {
      await this.rateLimitService.enforceAskLimit(context);
      return this.agentService.ask(body.question, context, body.channel);
    };

    if (idempotencyKey) {
      return this.askIdempotencyService.execute({
        key: idempotencyKey,
        context,
        request: {
          question: body.question,
          channel: body.channel ?? null
        },
        handler: runAsk
      });
    }

    return runAsk();
  }

  @Post("retrieval/preview")
  previewRetrieval(@Body() body: RetrievalPreviewDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.agentService.previewRetrieval(body.question, parseRequestContext(headers), body.limit);
  }

  @Post("retrieval/robustness")
  analyzeRetrievalRobustness(@Body() body: RetrievalRobustnessDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.agentService.analyzeRetrievalRobustness(body.question, parseRequestContext(headers), body.variants, body.limit);
  }

  @Post("retrieval/permission-diff")
  analyzeRetrievalPermissionDiff(
    @Body() body: RetrievalPermissionDiffDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.agentService.analyzeRetrievalPermissionDiff(body.question, parseRequestContext(headers), body.personas, body.limit);
  }

  @Post("incidents/plan")
  createIncidentPlan(@Body() body: IncidentPlanDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.incidentResponsePlanService.create(body.incident, parseRequestContext(headers), body.limit);
  }
}

function readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
