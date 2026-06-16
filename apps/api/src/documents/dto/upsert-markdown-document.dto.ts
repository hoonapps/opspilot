import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MinLength } from "class-validator";

export class UpsertMarkdownDocumentDto {
  @ApiProperty({ example: "public/status-page-policy.md" })
  @IsString()
  @Matches(/^[a-zA-Z0-9/_-]+\.md$/)
  path!: string;

  @ApiProperty({
    example:
      '---\ntitle: "Status Page Incident Communication"\nvisibility: public\n---\n# Status Page Incident Communication\n\nPublish the first notice within 15 minutes.'
  })
  @IsString()
  @MinLength(20)
  markdown!: string;
}
