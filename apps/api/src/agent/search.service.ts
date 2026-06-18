import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { LocalReranker } from "@opspilot/ai";
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
    baseScore?: number;
    rerankScore?: number;
    rerankRank?: number;
    rerankMethod?: RerankMethod;
    mode: "vector" | "hybrid";
  };
};

export type RerankMethod = "local_bm25_keytoken_v1" | "embedding_cosine_v1";

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

export type SearchOptions = {
  rerank?: boolean;
  candidateWindow?: number;
};

@Injectable()
export class SearchService {
  private readonly reranker = new LocalReranker();

  constructor(
    private readonly orm: MikroORM,
    private readonly embeddings: EmbeddingService,
    private readonly authz: AuthzService,
    private readonly elasticsearch: ElasticsearchService
  ) {}

  async search(question: string, context: RequestContext, limit = 5): Promise<SearchResult[]> {
    return (await this.searchWithAudit(question, context, limit)).results;
  }

  async searchWithAudit(question: string, context: RequestContext, limit = 5, options: SearchOptions = {}): Promise<SearchWithAudit> {
    const rerank = options.rerank ?? process.env.RETRIEVAL_RERANKER !== "off";
    const candidateLimit = rerank ? Math.max(options.candidateWindow ?? limit * 3, limit) : limit;
    const baseResults =
      process.env.RETRIEVAL_MODE === "hybrid" && this.elasticsearch.isEnabled()
        ? await this.hybridSearch(question, context, candidateLimit)
        : await this.vectorSearch(question, context, candidateLimit);
    const results = rerank ? await this.rerank(question, baseResults, limit) : baseResults.slice(0, limit);

    return {
      results,
      permissionAudit: await this.auditPermissionBoundary(question, context, candidateLimit)
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
            and not coalesce((c.metadata #>> '{security,promptInjectionRisk}')::boolean, false)
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
          and ${access.sql}
          and not coalesce((c.metadata #>> '{security,promptInjectionRisk}')::boolean, false);
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

  private async rerank(question: string, rows: SearchResult[], limit: number): Promise<SearchResult[]> {
    if (process.env.RETRIEVAL_RERANKER === "embedding") {
      return this.embeddingRerank(question, rows, limit);
    }

    const scores = new Map(
      this.reranker
        .rerank(
          question,
          rows.map((row) => ({
            id: row.chunkId,
            title: row.title,
            path: row.path,
            content: row.content,
            baseScore: row.score
          }))
        )
        .map((result, index) => [result.id, { ...result, rank: index + 1 }])
    );

    return [...rows]
      .sort((left, right) => {
        const leftScore = scores.get(left.chunkId)?.rerankScore ?? left.score;
        const rightScore = scores.get(right.chunkId)?.rerankScore ?? right.score;
        return rightScore - leftScore;
      })
      .slice(0, limit)
      .map((row) => {
        const score = scores.get(row.chunkId);
        return {
          ...row,
          score: Number((score?.rerankScore ?? row.score).toFixed(6)),
          retrieval: {
            ...row.retrieval,
            baseScore: Number(row.score.toFixed(6)),
            rerankScore: score?.rerankScore,
            rerankRank: score?.rank,
            rerankMethod: "local_bm25_keytoken_v1"
          }
        };
      });
  }

  private async embeddingRerank(question: string, rows: SearchResult[], limit: number): Promise<SearchResult[]> {
    if (rows.length === 0) {
      return [];
    }

    const questionVector = await this.embeddings.embedForRerank(question);
    const candidateVectors = await Promise.all(rows.map((row) => this.embeddings.embedForRerank(`${row.title}\n${row.path}\n${row.content}`)));
    const maxBaseScore = Math.max(...rows.map((row) => row.score), 1);
    const scoredRows = rows
      .map((row, index) => {
        const semanticScore = cosineSimilarity(questionVector, candidateVectors[index] ?? []);
        const normalizedBase = row.score / maxBaseScore;
        const rerankScore = Number((semanticScore * 0.78 + normalizedBase * 0.22).toFixed(6));

        return {
          row,
          rerankScore
        };
      })
      .sort((left, right) => right.rerankScore - left.rerankScore);

    return scoredRows.slice(0, limit).map(({ row, rerankScore }, index) => ({
      ...row,
      score: rerankScore,
      retrieval: {
        ...row.retrieval,
        baseScore: Number(row.score.toFixed(6)),
        rerankScore,
        rerankRank: index + 1,
        rerankMethod: "embedding_cosine_v1"
      }
    }));
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
          where not coalesce((c.metadata #>> '{security,promptInjectionRisk}')::boolean, false)
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

function cosineSimilarity(left: number[], right: number[]): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return Number((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))).toFixed(6));
}

function stripKoreanParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}
