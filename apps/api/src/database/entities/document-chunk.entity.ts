import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "document_chunks" })
export class DocumentChunk {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ fieldName: "document_id", type: "uuid" })
  documentId!: string;

  @Property({ fieldName: "chunk_index" })
  chunkIndex!: number;

  @Property({ type: "text" })
  content!: string;

  @Property({ columnType: "vector(64)" })
  embedding!: string;

  @Property({ type: "jsonb" })
  metadata: Record<string, unknown> = {};

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();
}
