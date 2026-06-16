import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnswerTraceService } from "./answer-trace.service";

@ApiTags("answers")
@Controller("answers")
export class AnswerTraceController {
  constructor(private readonly answerTraceService: AnswerTraceService) {}

  @Get(":id/trace")
  trace(@Param("id") id: string) {
    return this.answerTraceService.getTrace(id);
  }
}
