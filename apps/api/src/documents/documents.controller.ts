import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseRequestContext } from "../shared/request-context";
import { RunDocumentRevalidationDto } from "./dto/run-document-revalidation.dto";
import { SyncGithubDocumentsDto } from "./dto/sync-github-documents.dto";
import { UpsertMarkdownDocumentDto } from "./dto/upsert-markdown-document.dto";
import { DocumentsService } from "./documents.service";
import { GithubSyncService } from "./github-sync.service";
import { IndexingQueueService } from "./indexing-queue.service";
import { IndexingWorkerService } from "./indexing-worker.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly githubSyncService: GithubSyncService,
    private readonly indexingQueueService: IndexingQueueService,
    private readonly indexingWorkerService: IndexingWorkerService
  ) {}

  @Post("ingest")
  ingestSeedDocuments() {
    return this.documentsService.ingestSeedDocuments();
  }

  @Get()
  listDocuments() {
    return this.documentsService.listInventory();
  }

  @Get("index-quality")
  getIndexQualityReport() {
    return this.documentsService.getIndexQualityReport();
  }

  @Get("revalidation-queue")
  getRevalidationQueue(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.documentsService.getRevalidationQueue(parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }

  @Get("revalidation-runs")
  getRevalidationRuns(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.documentsService.listRevalidationRuns(parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }

  @Post("revalidation-runs")
  runRevalidation(@Body() body: RunDocumentRevalidationDto, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.documentsService.runRevalidation(body, parseRequestContext(headers));
  }

  @Get(":id/versions")
  async getDocumentVersions(@Param("id") id: string) {
    const history = await this.documentsService.getVersionHistory(id);
    if (!history) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    return history;
  }

  @Get(":id/impact")
  async getDocumentImpact(@Param("id") id: string) {
    const report = await this.documentsService.getImpactReport(id);
    if (!report) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    return report;
  }

  @Get(":id/index-explain")
  async getDocumentIndexExplain(@Param("id") id: string) {
    const report = await this.documentsService.getIndexExplainReport(id);
    if (!report) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    return report;
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

  @Get("indexing-jobs")
  async getIndexingQueue() {
    return {
      ...(await this.indexingQueueService.getQueueHealth()),
      worker: this.indexingWorkerService.status()
    };
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
