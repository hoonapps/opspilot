import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { DocumentsController } from "./documents.controller";
import { ChunkerService } from "./chunker.service";
import { DocumentsService } from "./documents.service";
import { GithubSyncService } from "./github-sync.service";
import { IndexingQueueService } from "./indexing-queue.service";
import { IndexingWorkerService } from "./indexing-worker.service";

@Module({
  imports: [AgentModule],
  controllers: [DocumentsController],
  providers: [ChunkerService, DocumentsService, GithubSyncService, IndexingQueueService, IndexingWorkerService],
  exports: [ChunkerService, DocumentsService, GithubSyncService, IndexingQueueService, IndexingWorkerService]
})
export class DocumentsModule {}
