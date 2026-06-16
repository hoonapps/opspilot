import { Module } from "@nestjs/common";
import { AuthzModule } from "../authz/authz.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AnswerGeneratorService } from "./answer-generator.service";
import { ElasticsearchService } from "./elasticsearch.service";
import { EmbeddingService } from "./embedding.service";
import { SearchService } from "./search.service";

@Module({
  imports: [AuthzModule],
  controllers: [AgentController],
  providers: [AgentService, AnswerGeneratorService, EmbeddingService, ElasticsearchService, SearchService],
  exports: [EmbeddingService, ElasticsearchService, SearchService, AgentService]
})
export class AgentModule {}
