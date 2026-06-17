import { Controller, Get, Headers, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { QuestionAuditBundleService } from "./question-audit-bundle.service";

@ApiTags("questions")
@Controller("questions")
export class QuestionAuditBundleController {
  constructor(private readonly questionAuditBundleService: QuestionAuditBundleService) {}

  @Get(":id/audit-bundle")
  auditBundle(@Param("id") id: string, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.questionAuditBundleService.getBundle(id, parseRequestContext(headers));
  }
}
