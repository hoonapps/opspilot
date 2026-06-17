import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class RetrievalPreviewDto {
  @ApiProperty({ example: "운영 DB에서 고객 정보를 바로 수정해도 돼?" })
  @IsString()
  @MinLength(2)
  question!: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
