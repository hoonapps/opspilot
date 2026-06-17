import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({
  imports: [HealthModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}
