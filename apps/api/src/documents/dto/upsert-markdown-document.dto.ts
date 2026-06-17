import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MinLength } from "class-validator";

export class UpsertMarkdownDocumentDto {
  @ApiProperty({ example: "public/status-page-policy.md" })
  @IsString()
  @Matches(/^[a-zA-Z0-9/_-]+\.md$/)
  path!: string;

  @ApiProperty({
    example:
      '---\ntitle: "상태 페이지 장애 공지 기준"\nvisibility: public\n---\n# 상태 페이지 장애 공지 기준\n\n고객 영향 장애가 확인되면 첫 공지를 15분 안에 게시합니다.'
  })
  @IsString()
  @MinLength(20)
  markdown!: string;
}
