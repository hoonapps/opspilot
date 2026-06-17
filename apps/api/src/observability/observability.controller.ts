import { Controller, Get } from "@nestjs/common";
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
}
