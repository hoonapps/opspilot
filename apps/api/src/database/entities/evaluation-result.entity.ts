import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "evaluation_results" })
export class EvaluationResult {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property()
  suiteName!: string;

  @Property()
  metricName!: string;

  @Property({ type: "float" })
  score!: number;

  @Property({ type: "jsonb" })
  details: Record<string, unknown> = {};

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
