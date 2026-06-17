import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ToolCallAuditService } from "./tool-call-audit.service";

@ApiTags("tool-calls")
@Controller("tool-calls")
export class ToolCallAuditController {
  constructor(private readonly toolCallAuditService: ToolCallAuditService) {}

  @Get("registry")
  registry() {
    return this.toolCallAuditService.registry();
  }

  @Get("recent")
  recent(@Query("limit") limit?: string) {
    return this.toolCallAuditService.recent(Number(limit ?? 10));
  }
}
