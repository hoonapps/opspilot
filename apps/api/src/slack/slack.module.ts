import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { SlackController } from "./slack.controller";
import { SlackService } from "./slack.service";

@Module({
  imports: [AgentModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService]
})
export class SlackModule {}
