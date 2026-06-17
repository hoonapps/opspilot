import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SyncGithubDocumentsDto } from "./dto/sync-github-documents.dto";
import { UpsertMarkdownDocumentDto } from "./dto/upsert-markdown-document.dto";
import { DocumentsService } from "./documents.service";
import { GithubSyncService } from "./github-sync.service";
import { IndexingQueueService } from "./indexing-queue.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly githubSyncService: GithubSyncService,
    private readonly indexingQueueService: IndexingQueueService
  ) {}

  @Post("ingest")
  ingestSeedDocuments() {
    return this.documentsService.ingestSeedDocuments();
  }

  @Get()
  listDocuments() {
    return this.documentsService.listInventory();
  }

  @Post("markdown")
  upsertMarkdownDocument(@Body() body: UpsertMarkdownDocumentDto) {
    return this.documentsService.ingestMarkdown(body.path, body.markdown);
  }

  @Post("github/sync")
  syncGithubDocuments(@Body() body: SyncGithubDocumentsDto) {
    return this.githubSyncService.sync(body);
  }

  @Post("indexing-jobs/markdown")
  enqueueMarkdownIndexingJob(@Body() body: UpsertMarkdownDocumentDto) {
    return this.indexingQueueService.enqueueMarkdown({ path: body.path, markdown: body.markdown });
  }

  @Get("indexing-jobs/:id")
  async getIndexingJob(@Param("id") id: string) {
    const job = await this.indexingQueueService.getJobStatus(id);
    if (!job) {
      throw new NotFoundException(`Indexing job not found: ${id}`);
    }
    return job;
  }
}
