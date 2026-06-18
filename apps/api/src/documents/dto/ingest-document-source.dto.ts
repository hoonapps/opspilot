import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUrl, Matches, MinLength } from "class-validator";

export type DocumentSourceType = "markdown" | "text" | "url" | "pdf" | "docx";

export class IngestDocumentSourceDto {
  @ApiProperty({ enum: ["markdown", "text", "url", "pdf", "docx"], example: "url" })
  @IsIn(["markdown", "text", "url", "pdf", "docx"])
  sourceType!: DocumentSourceType;

  @ApiPropertyOptional({ example: "public/payment-faq.md" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9/_-]+\.md$/)
  path?: string;

  @ApiPropertyOptional({ example: "결제 FAQ" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: "public" })
  @IsOptional()
  @IsIn(["public", "team", "restricted"])
  visibility?: "public" | "team" | "restricted";

  @ApiPropertyOptional({ example: "payments" })
  @IsOptional()
  @IsString()
  teamSlug?: string;

  @ApiPropertyOptional({ example: "https://example.com/ops/payment-faq" })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ["http", "https"], require_protocol: true })
  url?: string;

  @ApiPropertyOptional({ example: "payment-faq.pdf" })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: "Markdown or plain text content. Used by markdown/text sources." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ description: "Base64 encoded PDF or DOCX file body." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  base64?: string;
}

export class ResetDocumentsDto {
  @ApiPropertyOptional({ example: true, description: "When true, reload seed/documents after clearing the current index." })
  @IsOptional()
  reloadSeed?: boolean;
}
