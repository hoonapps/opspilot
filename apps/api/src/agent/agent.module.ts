import { Module } from "@nestjs/common";
import { AuthzModule } from "../authz/authz.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { EmbeddingService } from "./embedding.service";
import { SearchService } from "./search.service";

@Module({
  imports: [AuthzModule],
  controllers: [AgentController],
  providers: [AgentService, EmbeddingService, SearchService],
  exports: [EmbeddingService, SearchService, AgentService]
})
export class AgentModule {}
