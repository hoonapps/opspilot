import { Module } from "@nestjs/common";
import { AuthzModule } from "../authz/authz.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AnswerGeneratorService } from "./answer-generator.service";
import { ElasticsearchService } from "./elasticsearch.service";
import { EmbeddingService } from "./embedding.service";
import { RunbookChecklistService } from "./runbook-checklist.service";
import { SearchService } from "./search.service";
import { ToolCallAuditController } from "./tool-call-audit.controller";
import { ToolCallAuditService } from "./tool-call-audit.service";

@Module({
  imports: [AuthzModule],
  controllers: [AgentController, ToolCallAuditController],
  providers: [
    AgentService,
    AnswerGeneratorService,
    EmbeddingService,
    ElasticsearchService,
    SearchService,
    RunbookChecklistService,
    ToolCallAuditService
  ],
  exports: [EmbeddingService, ElasticsearchService, SearchService, AgentService, ToolCallAuditService]
})
export class AgentModule {}
