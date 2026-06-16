import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "answer_sources" })
export class AnswerSource {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ fieldName: "answer_id", type: "uuid" })
  answerId!: string;

  @Property({ fieldName: "document_id", type: "uuid" })
  documentId!: string;

  @Property({ fieldName: "chunk_id", type: "uuid" })
  chunkId!: string;

  @Property({ type: "float" })
  score!: number;

  @Property()
  rank!: number;
}
