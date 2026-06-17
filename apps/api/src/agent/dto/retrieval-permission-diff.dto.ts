import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

export class RetrievalPermissionPersonaDto {
  @ApiProperty({ example: "payments_oncall" })
  @IsString()
  @MinLength(2)
  id!: string;

  @ApiProperty({ example: "결제 온콜" })
  @IsString()
  @MinLength(2)
  label!: string;

  @ApiProperty({ required: false, type: [String], example: ["support_agent"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  roles?: string[];

  @ApiProperty({ required: false, type: [String], example: ["payments"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  teamSlugs?: string[];
}

export class RetrievalPermissionDiffDto {
  @ApiProperty({ example: "운영 DB에서 고객 정보를 바로 수정해도 돼?" })
  @IsString()
  @MinLength(2)
  question!: string;

  @ApiProperty({ required: false, type: [RetrievalPermissionPersonaDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => RetrievalPermissionPersonaDto)
  personas?: RetrievalPermissionPersonaDto[];

  @ApiProperty({ required: false, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
