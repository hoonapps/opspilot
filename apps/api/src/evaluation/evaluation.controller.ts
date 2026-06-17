import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { EvaluationService } from "./evaluation.service";

@ApiTags("evaluations")
@Controller("evaluations")
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Get("latest")
  latest(@Query("suiteName") suiteName?: string) {
    return this.evaluationService.latest(suiteName ?? "seed-ops-wiki");
  }

  @Get("history")
  history(@Query("suiteName") suiteName?: string, @Query("limit") limit?: string) {
    return this.evaluationService.history(suiteName ?? "seed-ops-wiki", Number(limit ?? 8));
  }

  @Get("cases")
  cases(@Query("suiteName") suiteName?: string) {
    return this.evaluationService.cases(suiteName ?? "seed-ops-wiki");
  }
}
