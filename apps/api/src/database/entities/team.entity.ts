import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "teams" })
export class Team {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ unique: true })
  slug!: string;

  @Property()
  name!: string;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
