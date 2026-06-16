import { Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post("ingest")
  ingestSeedDocuments() {
    return this.documentsService.ingestSeedDocuments();
  }
}
