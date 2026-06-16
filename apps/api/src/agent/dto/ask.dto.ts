import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class AskDto {
  @ApiProperty({ example: "E102 에러가 발생하면 어떻게 대응해야 해?" })
  @IsString()
  @MinLength(2)
  question!: string;

  @ApiProperty({ required: false, example: "slack" })
  @IsOptional()
  @IsString()
  channel?: string;
}
