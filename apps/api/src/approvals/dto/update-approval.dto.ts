import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApprovalStatus } from "../../database/entities/types";

export class UpdateApprovalDto {
  @ApiProperty({ enum: [ApprovalStatus.Approved, ApprovalStatus.Rejected], example: ApprovalStatus.Rejected })
  @IsEnum(ApprovalStatus)
  status!: ApprovalStatus.Approved | ApprovalStatus.Rejected;

  @ApiProperty({ required: false, example: "운영 데이터 변경은 DBA 티켓이 필요합니다." })
  @IsOptional()
  @IsString()
  reviewerNote?: string;
}
