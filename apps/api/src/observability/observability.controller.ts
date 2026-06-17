import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ObservabilityService } from "./observability.service";

@ApiTags("observability")
@Controller("observability")
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get("summary")
  summary() {
    return this.observabilityService.summary();
  }

  @Get("slo")
  slo() {
    return this.observabilityService.slo();
  }

  @Get("release-gate")
  releaseGate() {
    return this.observabilityService.releaseGate();
  }

  @Get("portfolio-readiness")
  portfolioReadiness() {
    return this.observabilityService.portfolioReadiness();
  }

  @Get("action-plan")
  actionPlan() {
    return this.observabilityService.actionPlan();
  }

  @Get("api-requests")
  apiRequests() {
    return this.observabilityService.apiRequests();
  }

  @Get("error-budget")
  errorBudget() {
    return this.observabilityService.errorBudget();
  }

  @Get("audit-ledger")
  auditLedger(@Query("limit") limit?: string) {
    return this.observabilityService.auditLedger(limit ? Number(limit) : undefined);
  }
}
