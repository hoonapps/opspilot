import { Controller, Get, HttpCode, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health() {
    return {
      ok: true,
      service: "opspilot-api"
    };
  }

  @Get("ready")
  @HttpCode(200)
  async readiness() {
    const report = await this.healthService.readiness();
    if (!report.ok) {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
