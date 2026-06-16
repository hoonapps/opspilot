import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { RequestContext } from "../shared/request-context";
import { EmbeddingService } from "./embedding.service";

export type SearchResult = {
  chunkId: string;
  documentId: string;
  title: string;
  path: string;
  visibility: string;
  teamSlug?: string | null;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly orm: MikroORM,
    private readonly embeddings: EmbeddingService,
    private readonly authz: AuthzService
  ) {}

  async search(question: string, context: RequestContext, limit = 5): Promise<SearchResult[]> {
    const vector = this.embeddings.toSqlVector(this.embeddings.embed(question));
    const access = this.authz.retrievalWhereClause(context);
    const rows = await this.orm.em.fork().getConnection().execute<SearchResult[]>(
      `
        select
          c.id as "chunkId",
          c.document_id as "documentId",
          d.title,
          d.path,
          d.visibility,
          d.team_slug as "teamSlug",
          c.content,
          c.metadata,
          greatest(0, 1 - (c.embedding <=> ?::vector)) as score
        from document_chunks c
        join documents d on d.id = c.document_id
        where ${access.sql}
        order by c.embedding <=> ?::vector
        limit ?;
      `,
      [vector, ...access.params, vector, limit]
    );

    return rows;
  }
}
