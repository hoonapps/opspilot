import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { DocumentsController } from "./documents.controller";
import { ChunkerService } from "./chunker.service";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [AgentModule],
  controllers: [DocumentsController],
  providers: [ChunkerService, DocumentsService],
  exports: [ChunkerService, DocumentsService]
})
export class DocumentsModule {}
