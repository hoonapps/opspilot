import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { HealthModule } from "../health/health.module";
import { ApiRequestLogInterceptor } from "./api-request-log.interceptor";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({
  imports: [HealthModule],
  controllers: [ObservabilityController],
  providers: [
    ObservabilityService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiRequestLogInterceptor
    }
  ],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}
