import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class CreateFeedbackDto {
  @ApiProperty({ example: "8a59798c-7905-46d9-9c28-1d35bcdabfc4" })
  @IsUUID()
  answerId!: string;

  @ApiProperty({ example: 1, minimum: -1, maximum: 1 })
  @IsInt()
  @Min(-1)
  @Max(1)
  rating!: number;

  @ApiProperty({ required: false, example: "Source was correct but confidence was too low." })
  @IsOptional()
  @IsString()
  comment?: string;
}
