import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

process.env.ENABLE_ELASTICSEARCH = "true";
process.env.RETRIEVAL_MODE = "hybrid";

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL ?? "http://localhost:29200";
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX ?? "opspilot_chunks";
const PUBLIC_PATH = "public/uploads/elasticsearch-hybrid-smoke.md";
const RESTRICTED_PATH = "restricted/elasticsearch-permission-smoke.md";
const PUBLIC_ACTOR = { roles: [], teamSlugs: [] };
const ADMIN_ACTOR = { roles: ["ops_admin"], teamSlugs: [] };

const PUBLIC_DOCUMENT = `---
title: "Elasticsearch 하이브리드 Smoke 문서"
visibility: public
tags: elasticsearch,hybrid,rag
---
# Elasticsearch 하이브리드 Smoke 문서

ESHYBRID-42 키워드는 Elasticsearch BM25와 pgvector 결과가 RRF 하이브리드 검색으로 합쳐지는지 검증합니다.
운영자는 하이브리드 모드에서도 답변 출처가 PostgreSQL 권한 재검사를 통과했는지 확인해야 합니다.
`;

const RESTRICTED_DOCUMENT = `---
title: "Elasticsearch 제한 문서 Smoke"
visibility: restricted
tags: elasticsearch,permission
---
# Elasticsearch 제한 문서 Smoke

ESRESTRICT-77 키워드는 Elasticsearch에 제한 문서가 색인되더라도 권한 없는 사용자의 답변 컨텍스트에 들어가면 안 됨을 검증합니다.
운영 관리자만 제한 문서의 세부 내용을 볼 수 있습니다.
`;

async function main() {
  await assertElasticsearchAvailable();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let documents: DocumentsService | null = null;
  let shouldRestoreSeed = false;

  try {
    const documentsService = app.get(DocumentsService);
    documents = documentsService;
    const agent = app.get(AgentService);

    await documentsService.resetDocuments(false);
    shouldRestoreSeed = true;
    const publicIngest = await documentsService.ingestMarkdown(PUBLIC_PATH, PUBLIC_DOCUMENT);
    const restrictedIngest = await documentsService.ingestMarkdown(RESTRICTED_PATH, RESTRICTED_DOCUMENT);
    await refreshElasticsearch();

    const publicPreview = await agent.previewRetrieval("ESHYBRID-42 하이브리드 검색은 무엇을 검증해?", PUBLIC_ACTOR, 5);
    const publicAnswer = await agent.ask("ESHYBRID-42 하이브리드 검색은 무엇을 검증해?", PUBLIC_ACTOR, "elasticsearch-hybrid-smoke");
    const restrictedPublicPreview = await agent.previewRetrieval("ESRESTRICT-77 제한 문서 내용은 뭐야?", PUBLIC_ACTOR, 5);
    const restrictedAdminPreview = await agent.previewRetrieval("ESRESTRICT-77 제한 문서 내용은 뭐야?", ADMIN_ACTOR, 5);

    const topPublicCandidate = publicPreview.candidates[0] ?? null;
    const topAdminCandidate = restrictedAdminPreview.candidates[0] ?? null;
    const ok =
      publicIngest.chunks > 0 &&
      restrictedIngest.chunks > 0 &&
      publicPreview.permissionAudit.enforcement === "postgres_recheck_after_elasticsearch" &&
      publicPreview.diagnostics.queryPlan.mode === "hybrid" &&
      topPublicCandidate?.path === PUBLIC_PATH &&
      topPublicCandidate.retrieval.mode === "hybrid" &&
      typeof topPublicCandidate.retrieval.lexicalScore === "number" &&
      publicAnswer.sources[0]?.path === PUBLIC_PATH &&
      restrictedPublicPreview.permissionAudit.enforcement === "postgres_recheck_after_elasticsearch" &&
      restrictedPublicPreview.permissionAudit.deniedCandidateCount > 0 &&
      restrictedPublicPreview.candidates.every((candidate) => candidate.path !== RESTRICTED_PATH) &&
      topAdminCandidate?.path === RESTRICTED_PATH &&
      topAdminCandidate.retrieval.mode === "hybrid";

    console.log(
      JSON.stringify(
        {
          ok,
          elasticsearch: {
            url: ELASTICSEARCH_URL,
            index: ELASTICSEARCH_INDEX
          },
          ingested: {
            public: { path: publicIngest.path, chunks: publicIngest.chunks },
            restricted: { path: restrictedIngest.path, chunks: restrictedIngest.chunks }
          },
          publicPreview: summarizePreview(publicPreview),
          restrictedPublicPreview: summarizePreview(restrictedPublicPreview),
          restrictedAdminPreview: summarizePreview(restrictedAdminPreview),
          answer: {
            topSource: publicAnswer.sources[0]?.path ?? null,
            confidence: publicAnswer.confidence,
            documentAgreement: publicAnswer.documentAgreement.score
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Elasticsearch hybrid smoke test failed");
    }

  } finally {
    if (documents && shouldRestoreSeed) {
      await documents.resetDocuments(true);
      await refreshElasticsearch();
    }
    await app.close();
  }
}

async function assertElasticsearchAvailable(): Promise<void> {
  const response = await fetch(ELASTICSEARCH_URL);
  if (!response.ok) {
    throw new Error(`Elasticsearch is not reachable at ${ELASTICSEARCH_URL}: ${response.status}`);
  }
}

async function refreshElasticsearch(): Promise<void> {
  const response = await fetch(`${ELASTICSEARCH_URL}/${ELASTICSEARCH_INDEX}/_refresh`, { method: "POST" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Elasticsearch refresh failed: ${response.status}`);
  }
}

function summarizePreview(preview: Awaited<ReturnType<AgentService["previewRetrieval"]>>) {
  return {
    mode: preview.diagnostics.queryPlan.mode,
    enforcement: preview.permissionAudit.enforcement,
    deniedCandidateCount: preview.permissionAudit.deniedCandidateCount,
    topCandidate: preview.candidates[0]
      ? {
          path: preview.candidates[0].path,
          score: preview.candidates[0].score,
          retrieval: preview.candidates[0].retrieval
        }
      : null
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
