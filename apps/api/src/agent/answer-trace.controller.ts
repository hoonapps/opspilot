import { Controller, Get, Headers, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { AnswerTraceService } from "./answer-trace.service";

@ApiTags("answers")
@Controller("answers")
export class AnswerTraceController {
  constructor(private readonly answerTraceService: AnswerTraceService) {}

  @Get(":id/trace")
  trace(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getTrace(id, parseRequestContext(headers));
  }

  @Get(":id/proof")
  proof(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getProof(id, parseRequestContext(headers));
  }

  @Get(":id/replay")
  replay(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.replay(id, parseRequestContext(headers));
  }

  @Get(":id/evidence-bundle")
  evidenceBundle(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getEvidenceBundle(id, parseRequestContext(headers));
  }

  @Get(":id/claim-support")
  claimSupport(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getClaimSupport(id, parseRequestContext(headers));
  }

  @Get(":id/lineage")
  lineage(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getLineageGraph(id, parseRequestContext(headers));
  }

  @Get(":id/quality-gate")
  qualityGate(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.answerTraceService.getQualityGate(id, parseRequestContext(headers));
  }
}
