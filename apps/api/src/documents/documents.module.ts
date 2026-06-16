import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { DocumentsController } from "./documents.controller";
import { ChunkerService } from "./chunker.service";
import { DocumentsService } from "./documents.service";
import { GithubSyncService } from "./github-sync.service";

@Module({
  imports: [AgentModule],
  controllers: [DocumentsController],
  providers: [ChunkerService, DocumentsService, GithubSyncService],
  exports: [ChunkerService, DocumentsService, GithubSyncService]
})
export class DocumentsModule {}
