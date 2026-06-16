import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "document_versions" })
export class DocumentVersion {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ fieldName: "document_id", type: "uuid" })
  documentId!: string;

  @Property()
  version!: number;

  @Property()
  contentHash!: string;

  @Property({ type: "text" })
  content!: string;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
