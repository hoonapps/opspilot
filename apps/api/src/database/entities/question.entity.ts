import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "questions" })
export class Question {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "text" })
  text!: string;

  @Property({ nullable: true })
  channel?: string;

  @Property({ type: "jsonb" })
  actor: Record<string, unknown> = {};

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
