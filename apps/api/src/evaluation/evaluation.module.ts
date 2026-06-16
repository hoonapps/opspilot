import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { EvaluationController } from "./evaluation.controller";
import { EvaluationService } from "./evaluation.service";

@Module({
  imports: [AgentModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService]
})
export class EvaluationModule {}
