import { Injectable, Logger } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";
import { RequestContext } from "../shared/request-context";

export type SearchIndexChunk = {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  title: string;
  path: string;
  content: string;
  visibility: string;
  teamSlug?: string | null;
  metadata: Record<string, unknown>;
};

export type LexicalHit = {
  chunkId: string;
  score: number;
};

@Injectable()
export class ElasticsearchService {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexName = process.env.ELASTICSEARCH_INDEX ?? "opspilot_chunks";
  private client?: Client;
  private indexReady = false;

  isEnabled(): boolean {
    return process.env.ENABLE_ELASTICSEARCH === "true";
  }

  async indexChunk(chunk: SearchIndexChunk): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const client = await this.getClient();
      await client.index({
        index: this.indexName,
        id: chunk.chunkId,
        document: chunk,
        refresh: false
      });
    } catch (error) {
      this.logger.warn(`Skipping Elasticsearch index write: ${formatError(error)}`);
    }
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const client = await this.getClient();
      await client.deleteByQuery({
        index: this.indexName,
        refresh: true,
        conflicts: "proceed",
        query: {
          term: {
            documentId
          }
        }
      });
    } catch (error) {
      this.logger.warn(`Skipping Elasticsearch delete: ${formatError(error)}`);
    }
  }

  async search(question: string, context: RequestContext, limit: number): Promise<LexicalHit[]> {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      const client = await this.getClient();
      const response = await client.search<SearchIndexChunk>({
        index: this.indexName,
        size: limit,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: question,
                  fields: ["title^2", "path^2", "content"],
                  operator: "or"
                }
              }
            ],
            filter: [this.accessFilter(context)]
          }
        }
      });

      return response.hits.hits
        .filter((hit) => hit._source?.chunkId)
        .map((hit) => ({
          chunkId: hit._source!.chunkId,
          score: hit._score ?? 0
        }));
    } catch (error) {
      this.logger.warn(`Skipping Elasticsearch search: ${formatError(error)}`);
      return [];
    }
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = new Client({
        node: process.env.ELASTICSEARCH_URL ?? "http://localhost:29200"
      });
    }

    if (!this.indexReady) {
      await this.ensureIndex(this.client);
      this.indexReady = true;
    }

    return this.client;
  }

  private async ensureIndex(client: Client): Promise<void> {
    const exists = await client.indices.exists({ index: this.indexName });
    if (exists) {
      return;
    }

    await client.indices.create({
      index: this.indexName,
      mappings: {
        properties: {
          chunkId: { type: "keyword" },
          documentId: { type: "keyword" },
          chunkIndex: { type: "integer" },
          title: { type: "text", fields: { keyword: { type: "keyword" } } },
          path: { type: "text", fields: { keyword: { type: "keyword" } } },
          content: { type: "text" },
          visibility: { type: "keyword" },
          teamSlug: { type: "keyword" },
          metadata: { type: "object", enabled: false }
        }
      }
    });
  }

  private accessFilter(context: RequestContext): Record<string, unknown> {
    const should: Record<string, unknown>[] = [
      {
        term: {
          visibility: "public"
        }
      }
    ];

    if (context.teamSlugs.length > 0) {
      should.push({
        bool: {
          must: [{ term: { visibility: "team" } }, { terms: { teamSlug: context.teamSlugs } }]
        }
      });
    }

    if (context.roles.includes("ops_admin") || context.roles.includes("security_admin")) {
      should.push({
        term: {
          visibility: "restricted"
        }
      });
    }

    return {
      bool: {
        should,
        minimum_should_match: 1
      }
    };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
