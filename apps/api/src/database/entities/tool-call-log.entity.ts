import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { ToolCallStatus } from "./types";

@Entity({ tableName: "tool_call_logs" })
export class ToolCallLog {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ nullable: true, fieldName: "question_id", type: "uuid" })
  questionId?: string;

  @Property()
  toolName!: string;

  @Property({ type: "jsonb" })
  input: Record<string, unknown> = {};

  @Property({ type: "jsonb" })
  output: Record<string, unknown> = {};

  @Enum(() => ToolCallStatus)
  status: ToolCallStatus = ToolCallStatus.Allowed;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
