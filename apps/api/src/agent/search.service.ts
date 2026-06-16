import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { RequestContext } from "../shared/request-context";
import { ElasticsearchService, LexicalHit } from "./elasticsearch.service";
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
  retrieval: {
    vectorScore?: number;
    lexicalScore?: number;
    fusedScore?: number;
    mode: "vector" | "hybrid";
  };
};

export type PermissionBoundaryAudit = {
  enforcement: "pre_ranking_sql_filter" | "postgres_recheck_after_elasticsearch";
  candidateWindow: number;
  allowedCandidateCount: number;
  deniedCandidateCount: number;
  deniedByVisibility: Record<string, number>;
  actor: {
    roles: string[];
    teamSlugs: string[];
  };
};

export type SearchWithAudit = {
  results: SearchResult[];
  permissionAudit: PermissionBoundaryAudit;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly orm: MikroORM,
    private readonly embeddings: EmbeddingService,
    private readonly authz: AuthzService,
    private readonly elasticsearch: ElasticsearchService
  ) {}

  async search(question: string, context: RequestContext, limit = 5): Promise<SearchResult[]> {
    return (await this.searchWithAudit(question, context, limit)).results;
  }

  async searchWithAudit(question: string, context: RequestContext, limit = 5): Promise<SearchWithAudit> {
    const results =
      process.env.RETRIEVAL_MODE === "hybrid" && this.elasticsearch.isEnabled()
        ? await this.hybridSearch(question, context, limit)
        : await this.vectorSearch(question, context, limit);

    return {
      results,
      permissionAudit: await this.auditPermissionBoundary(question, context, limit)
    };
  }

  private async vectorSearch(question: string, context: RequestContext, limit = 5): Promise<SearchResult[]> {
    const vector = this.embeddings.toSqlVector(await this.embeddings.embed(question));
    const access = this.authz.retrievalWhereClause(context);
    const lexicalTokens = tokenizeForSearch(question);
    const lexicalScoreSql =
      lexicalTokens.length > 0
        ? `(${lexicalTokens.map(() => "case when search_text like ? then 1 else 0 end").join(" + ")})::float / ${lexicalTokens.length}`
        : "0";

    const rows = await this.orm.em.fork().getConnection().execute<SearchResult[]>(
      `
        with base as (
          select
            c.id as "chunkId",
            c.document_id as "documentId",
            d.title,
            d.path,
            d.visibility,
            d.team_slug as "teamSlug",
            c.content,
            c.metadata,
            lower(concat_ws(' ', d.title, d.path, c.content)) as search_text,
            greatest(0, 1 - (c.embedding <=> ?::vector)) as vector_score
          from document_chunks c
          join documents d on d.id = c.document_id
          where ${access.sql}
        ),
        scored as (
          select
            *,
            ${lexicalScoreSql} as lexical_score
          from base
        )
        select
          "chunkId",
          "documentId",
          title,
          path,
          visibility,
          "teamSlug",
          content,
          metadata,
          (vector_score * 0.45 + lexical_score * 0.55) as score,
          jsonb_build_object(
            'vectorScore', vector_score,
            'lexicalScore', lexical_score,
            'mode', 'vector'
          ) as retrieval
        from scored
        order by score desc
        limit ?;
      `,
      [vector, ...access.params, ...lexicalTokens.map((token) => `%${token}%`), limit]
    );

    return rows;
  }

  private async hybridSearch(question: string, context: RequestContext, limit: number): Promise<SearchResult[]> {
    const [vectorRows, lexicalHits] = await Promise.all([
      this.vectorSearch(question, context, Math.max(limit * 3, 10)),
      this.elasticsearch.search(question, context, Math.max(limit * 3, 10))
    ]);
    const lexicalRows = await this.loadChunksByIds(
      lexicalHits.map((hit) => hit.chunkId),
      context
    );

    const fused = new Map<string, SearchResult>();
    applyRankScore(fused, vectorRows, "vector");
    applyRankScore(fused, attachLexicalScores(lexicalRows, lexicalHits), "lexical");

    return [...fused.values()]
      .map((row) => ({
        ...row,
        score: Number((row.retrieval.fusedScore ?? row.score).toFixed(6)),
        retrieval: {
          ...row.retrieval,
          mode: "hybrid" as const
        }
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async loadChunksByIds(chunkIds: string[], context: RequestContext): Promise<SearchResult[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const access = this.authz.retrievalWhereClause(context);
    return this.orm.em.fork().getConnection().execute<SearchResult[]>(
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
          0 as score,
          jsonb_build_object('mode', 'hybrid') as retrieval
        from document_chunks c
        join documents d on d.id = c.document_id
        where c.id in (${chunkIds.map(() => "?::uuid").join(", ")})
          and ${access.sql};
      `,
      [...chunkIds, ...access.params]
    );
  }

  private async auditPermissionBoundary(question: string, context: RequestContext, limit: number): Promise<PermissionBoundaryAudit> {
    const candidateWindow = Math.max(limit * 3, 10);
    const candidates = await this.unauthorizedCandidateWindow(question, candidateWindow);
    const deniedByVisibility: Record<string, number> = {};
    let allowedCandidateCount = 0;
    let deniedCandidateCount = 0;

    for (const candidate of candidates) {
      if (this.authz.canAccessDocument(context, candidate.visibility, candidate.teamSlug)) {
        allowedCandidateCount += 1;
      } else {
        deniedCandidateCount += 1;
        deniedByVisibility[candidate.visibility] = (deniedByVisibility[candidate.visibility] ?? 0) + 1;
      }
    }

    return {
      enforcement:
        process.env.RETRIEVAL_MODE === "hybrid" && this.elasticsearch.isEnabled()
          ? "postgres_recheck_after_elasticsearch"
          : "pre_ranking_sql_filter",
      candidateWindow,
      allowedCandidateCount,
      deniedCandidateCount,
      deniedByVisibility,
      actor: {
        roles: context.roles,
        teamSlugs: context.teamSlugs
      }
    };
  }

  private async unauthorizedCandidateWindow(question: string, limit: number): Promise<Array<{ visibility: string; teamSlug?: string | null }>> {
    const vector = this.embeddings.toSqlVector(await this.embeddings.embed(question));
    const lexicalTokens = tokenizeForSearch(question);
    const lexicalScoreSql =
      lexicalTokens.length > 0
        ? `(${lexicalTokens.map(() => "case when search_text like ? then 1 else 0 end").join(" + ")})::float / ${lexicalTokens.length}`
        : "0";

    return this.orm.em.fork().getConnection().execute<Array<{ visibility: string; teamSlug?: string | null }>>(
      `
        with base as (
          select
            d.visibility,
            d.team_slug as "teamSlug",
            lower(concat_ws(' ', d.title, d.path, c.content)) as search_text,
            greatest(0, 1 - (c.embedding <=> ?::vector)) as vector_score
          from document_chunks c
          join documents d on d.id = c.document_id
        ),
        scored as (
          select
            *,
            ${lexicalScoreSql} as lexical_score
          from base
        )
        select
          visibility,
          "teamSlug"
        from scored
        order by (vector_score * 0.45 + lexical_score * 0.55) desc
        limit ?;
      `,
      [vector, ...lexicalTokens.map((token) => `%${token}%`), limit]
    );
  }
}

function attachLexicalScores(rows: SearchResult[], hits: LexicalHit[]): SearchResult[] {
  const maxScore = Math.max(...hits.map((hit) => hit.score), 1);
  const scoreById = new Map(hits.map((hit) => [hit.chunkId, hit.score / maxScore]));

  return rows.map((row) => ({
    ...row,
    score: Number((scoreById.get(row.chunkId) ?? 0).toFixed(6)),
    retrieval: {
      ...row.retrieval,
      lexicalScore: Number((scoreById.get(row.chunkId) ?? 0).toFixed(6)),
      mode: "hybrid"
    }
  }));
}

function applyRankScore(target: Map<string, SearchResult>, rows: SearchResult[], source: "vector" | "lexical"): void {
  rows.forEach((row, index) => {
    const current = target.get(row.chunkId) ?? row;
    const contribution = 1 / (60 + index + 1);
    const fusedScore = (current.retrieval.fusedScore ?? 0) + contribution;
    const vectorScore = source === "vector" ? row.score : current.retrieval.vectorScore;
    const lexicalScore = source === "lexical" ? row.score : current.retrieval.lexicalScore;

    target.set(row.chunkId, {
      ...current,
      score: fusedScore,
      retrieval: {
        ...current.retrieval,
        vectorScore,
        lexicalScore,
        fusedScore,
        mode: "hybrid"
      }
    });
  });
}

function tokenizeForSearch(question: string): string[] {
  const baseTokens = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const expanded = baseTokens.flatMap((token) => {
    const stripped = stripKoreanParticle(token);
    return stripped !== token && stripped.length >= 2 ? [token, stripped] : [token];
  });

  return [...new Set(expanded)].slice(0, 16);
}

function stripKoreanParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}
