import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class IncidentPlanDto {
  @ApiProperty({ example: "정산 배치가 30분 이상 지연되면 어떤 순서로 대응해야 해?" })
  @IsString()
  @MinLength(2)
  incident!: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
