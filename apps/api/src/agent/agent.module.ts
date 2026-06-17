import { Module } from "@nestjs/common";
import { AuthzModule } from "../authz/authz.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AnswerTraceController } from "./answer-trace.controller";
import { AnswerTraceService } from "./answer-trace.service";
import { AnswerGeneratorService } from "./answer-generator.service";
import { ElasticsearchService } from "./elasticsearch.service";
import { EmbeddingService } from "./embedding.service";
import { RateLimitService } from "./rate-limit.service";
import { RunbookChecklistService } from "./runbook-checklist.service";
import { SearchService } from "./search.service";
import { ToolCallAuditController } from "./tool-call-audit.controller";
import { ToolCallAuditService } from "./tool-call-audit.service";

@Module({
  imports: [AuthzModule],
  controllers: [AgentController, AnswerTraceController, ToolCallAuditController],
  providers: [
    AgentService,
    AnswerTraceService,
    AnswerGeneratorService,
    EmbeddingService,
    ElasticsearchService,
    RateLimitService,
    SearchService,
    RunbookChecklistService,
    ToolCallAuditService
  ],
  exports: [EmbeddingService, ElasticsearchService, RateLimitService, SearchService, AgentService, AnswerTraceService, ToolCallAuditService]
})
export class AgentModule {}
