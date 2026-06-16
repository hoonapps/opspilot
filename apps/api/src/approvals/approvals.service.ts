import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { ApprovalStatus } from "../database/entities/types";
import { UpdateApprovalDto } from "./dto/update-approval.dto";

export type ApprovalResponse = {
  id: string;
  questionId?: string | null;
  question?: string | null;
  action: string;
  reason: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
};

type ApprovalRow = {
  id: string;
  question_id?: string | null;
  question?: string | null;
  action: string;
  reason: Record<string, unknown>;
  status: ApprovalStatus;
  created_at: Date | string;
};

@Injectable()
export class ApprovalsService {
  constructor(private readonly orm: MikroORM) {}

  async list(status?: ApprovalStatus): Promise<{ approvals: ApprovalResponse[] }> {
    const params: unknown[] = [];
    const statusWhere = status ? "where ar.status = ?" : "";
    if (status) {
      params.push(status);
    }

    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select
          ar.id,
          ar.question_id,
          q.text as question,
          ar.action,
          ar.reason,
          ar.status,
          ar.created_at
        from approval_requests ar
        left join questions q on q.id = ar.question_id
        ${statusWhere}
        order by ar.created_at desc
        limit 20;
      `,
      params
    )) as ApprovalRow[];

    return {
      approvals: rows.map((row) => ({
        id: row.id,
        questionId: row.question_id,
        question: row.question,
        action: row.action,
        reason: row.reason,
        status: row.status,
        createdAt: toIsoString(row.created_at)
      }))
    };
  }

  async update(id: string, input: UpdateApprovalDto): Promise<ApprovalResponse> {
    if (![ApprovalStatus.Approved, ApprovalStatus.Rejected].includes(input.status)) {
      throw new BadRequestException("Approval status must be approved or rejected");
    }

    const [row] = (await this.orm.em.fork().getConnection().execute(
      `
        update approval_requests ar
        set
          status = ?,
          reason = ar.reason || ?::jsonb
        from questions q
        where ar.id = ?::uuid
          and q.id = ar.question_id
        returning ar.id, ar.question_id, q.text as question, ar.action, ar.reason, ar.status, ar.created_at;
      `,
      [input.status, JSON.stringify({ reviewerNote: input.reviewerNote ?? null }), id]
    )) as ApprovalRow[];

    if (!row) {
      throw new NotFoundException("Approval request not found");
    }

    return {
      id: row.id,
      questionId: row.question_id,
      question: row.question,
      action: row.action,
      reason: row.reason,
      status: row.status,
      createdAt: toIsoString(row.created_at)
    };
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
