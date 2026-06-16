import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { DocumentVisibility } from "./types";

@Entity({ tableName: "documents" })
export class Document {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ unique: true })
  path!: string;

  @Property()
  title!: string;

  @Enum(() => DocumentVisibility)
  visibility: DocumentVisibility = DocumentVisibility.Public;

  @Property({ fieldName: "team_slug", nullable: true })
  teamSlug?: string;

  @Property({ type: "jsonb" })
  metadata: Record<string, unknown> = {};

  @Property()
  contentHash!: string;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt = new Date();
}
