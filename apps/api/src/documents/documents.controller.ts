import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SyncGithubDocumentsDto } from "./dto/sync-github-documents.dto";
import { UpsertMarkdownDocumentDto } from "./dto/upsert-markdown-document.dto";
import { DocumentsService } from "./documents.service";
import { GithubSyncService } from "./github-sync.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly githubSyncService: GithubSyncService
  ) {}

  @Post("ingest")
  ingestSeedDocuments() {
    return this.documentsService.ingestSeedDocuments();
  }

  @Post("markdown")
  upsertMarkdownDocument(@Body() body: UpsertMarkdownDocumentDto) {
    return this.documentsService.ingestMarkdown(body.path, body.markdown);
  }

  @Post("github/sync")
  syncGithubDocuments(@Body() body: SyncGithubDocumentsDto) {
    return this.githubSyncService.sync(body);
  }
}
