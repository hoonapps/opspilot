import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "feedback" })
export class Feedback {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ fieldName: "answer_id", type: "uuid" })
  answerId!: string;

  @Property()
  rating!: number;

  @Property({ type: "text", nullable: true })
  comment?: string;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
