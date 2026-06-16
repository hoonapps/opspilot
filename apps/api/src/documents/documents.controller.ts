import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UpsertMarkdownDocumentDto } from "./dto/upsert-markdown-document.dto";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post("ingest")
  ingestSeedDocuments() {
    return this.documentsService.ingestSeedDocuments();
  }

  @Post("markdown")
  upsertMarkdownDocument(@Body() body: UpsertMarkdownDocumentDto) {
    return this.documentsService.ingestMarkdown(body.path, body.markdown);
  }
}
