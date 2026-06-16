import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApprovalStatus } from "../../database/entities/types";

export class UpdateApprovalDto {
  @ApiProperty({ enum: [ApprovalStatus.Approved, ApprovalStatus.Rejected], example: ApprovalStatus.Rejected })
  @IsEnum(ApprovalStatus)
  status!: ApprovalStatus.Approved | ApprovalStatus.Rejected;

  @ApiProperty({ required: false, example: "Production data changes require a DBA ticket." })
  @IsOptional()
  @IsString()
  reviewerNote?: string;
}
