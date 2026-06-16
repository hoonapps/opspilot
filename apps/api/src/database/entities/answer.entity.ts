import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "answers" })
export class Answer {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ fieldName: "question_id", type: "uuid" })
  questionId!: string;

  @Property({ type: "text" })
  text!: string;

  @Property({ type: "float" })
  confidence!: number;

  @Property()
  needsHumanReview!: boolean;

  @Property({ type: "jsonb" })
  metadata: Record<string, unknown> = {};

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
