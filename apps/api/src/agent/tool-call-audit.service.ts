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

@Injectable()
export class ToolCallAuditService {
  constructor(private readonly orm: MikroORM) {}

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
