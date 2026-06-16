import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches } from "class-validator";

export class SyncGithubDocumentsDto {
  @ApiProperty({ example: "hoonapps" })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  owner!: string;

  @ApiProperty({ example: "opspilot" })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  repo!: string;

  @ApiProperty({ required: false, example: "main" })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false, example: "docs" })
  @IsOptional()
  @IsString()
  rootPath?: string;

  @ApiProperty({ required: false, example: "github/hoonapps/opspilot" })
  @IsOptional()
  @IsString()
  sourcePrefix?: string;
}
