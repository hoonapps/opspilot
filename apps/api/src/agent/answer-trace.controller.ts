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
}
