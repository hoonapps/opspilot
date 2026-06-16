import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { ApprovalStatus } from "./types";

@Entity({ tableName: "approval_requests" })
export class ApprovalRequest {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ nullable: true, fieldName: "question_id", type: "uuid" })
  questionId?: string;

  @Property()
  action!: string;

  @Property({ type: "jsonb" })
  reason: Record<string, unknown> = {};

  @Enum(() => ApprovalStatus)
  status: ApprovalStatus = ApprovalStatus.Pending;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
