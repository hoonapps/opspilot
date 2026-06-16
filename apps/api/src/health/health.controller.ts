import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: "opspilot-api"
    };
  }
}
