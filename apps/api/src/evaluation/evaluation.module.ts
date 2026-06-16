import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { EvaluationService } from "./evaluation.service";

@Module({
  imports: [AgentModule],
  providers: [EvaluationService],
  exports: [EvaluationService]
})
export class EvaluationModule {}
