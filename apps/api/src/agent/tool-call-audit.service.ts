import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";

export type ToolCallAuditItem = {
  id: string;
  questionId: string | null;
  question: string | null;
  toolName: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};

export type AgentToolDefinition = {
  name: string;
  category: "retrieval" | "runbook" | "approval";
  description: string;
  sideEffect: "none" | "database_write";
  approvalPolicy: "auto_allowed" | "human_required";
  statusWhenCalled: "allowed" | "needs_approval";
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  auditFields: string[];
};

@Injectable()
export class ToolCallAuditService {
  constructor(private readonly orm: MikroORM) {}

  registry(): { tools: AgentToolDefinition[] } {
    return {
      tools: [
        {
          name: "search_documents",
          category: "retrieval",
          description: "답변 생성 전에 호출자 권한으로 필터링된 문서 청크를 검색합니다.",
          sideEffect: "none",
          approvalPolicy: "auto_allowed",
          statusWhenCalled: "allowed",
          inputSchema: {
            question: "string",
            limit: "number",
            actor: "RequestContext"
          },
          outputSchema: {
            sourceCount: "number",
            paths: "string[]",
            permissionAudit: "PermissionBoundaryAudit"
          },
          auditFields: ["question_id", "tool_name", "input.actor", "output.permissionAudit", "status", "created_at"]
        },
        {
          name: "create_runbook_checklist",
          category: "runbook",
          description: "장애 대응 질문에 맞춰 검색된 런북 문서에서 체크리스트 항목을 추출합니다.",
          sideEffect: "none",
          approvalPolicy: "auto_allowed",
          statusWhenCalled: "allowed",
          inputSchema: {
            question: "string",
            sourcePath: "string"
          },
          outputSchema: {
            title: "string",
            itemCount: "number",
            items: "string[]"
          },
          auditFields: ["question_id", "tool_name", "input.sourcePath", "output.itemCount", "status", "created_at"]
        },
        {
          name: "request_human_approval",
          category: "approval",
          description: "운영 영향이 있는 민감 작업을 자동 실행하지 않고 사람 승인 대기열로 넘깁니다.",
          sideEffect: "database_write",
          approvalPolicy: "human_required",
          statusWhenCalled: "needs_approval",
          inputSchema: {
            action: "sensitive_operation"
          },
          outputSchema: {
            approvalStatus: "pending"
          },
          auditFields: ["question_id", "tool_name", "input.action", "output.approvalStatus", "status", "created_at"]
        }
      ]
    };
  }

  async recent(limit = 10): Promise<{ toolCalls: ToolCallAuditItem[] }> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select
          t.id,
          t.question_id,
          q.text as question,
          t.tool_name,
          t.status,
          t.input,
          t.output,
          t.created_at
        from tool_call_logs t
        left join questions q on q.id = t.question_id
        order by t.created_at desc
        limit ?;
      `,
      [safeLimit]
    )) as Array<{
      id: string;
      question_id: string | null;
      question: string | null;
      tool_name: string;
      status: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      created_at: Date | string;
    }>;

    return {
      toolCalls: rows.map((row) => ({
        id: row.id,
        questionId: row.question_id,
        question: row.question,
        toolName: row.tool_name,
        status: row.status,
        input: row.input,
        output: row.output,
        createdAt: new Date(row.created_at).toISOString()
      }))
    };
  }
}
