import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApprovalStatus } from "../database/entities/types";
import { ApprovalsService } from "./approvals.service";
import { UpdateApprovalDto } from "./dto/update-approval.dto";

@ApiTags("approvals")
@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  list(@Query("status") status?: ApprovalStatus) {
    return this.approvalsService.list(status);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateApprovalDto) {
    return this.approvalsService.update(id, body);
  }
}
