import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RunDocumentRevalidationDto {
  @ApiProperty({ example: "4c2ce15c-0a77-4a20-8d74-0a54bb2f3d4f" })
  @IsUUID()
  documentId!: string;

  @ApiProperty({ example: "c1b3b7bb-3a31-4bb7-9f7f-34b7c1c4d2e7" })
  @IsUUID()
  answerId!: string;
}
