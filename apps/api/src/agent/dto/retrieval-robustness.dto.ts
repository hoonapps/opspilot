import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class RetrievalRobustnessDto {
  @ApiProperty({ example: "고객 공지 SLA와 15분 공지 기준은 무엇이야?" })
  @IsString()
  @MinLength(2)
  question!: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ["장애 공지는 몇 분 안에 올려야 해?", "상태 페이지 첫 공지 기준 알려줘"]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  variants?: string[];

  @ApiProperty({ required: false, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
