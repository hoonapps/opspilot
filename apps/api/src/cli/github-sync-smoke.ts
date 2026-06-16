import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { join } from "node:path";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { GithubSyncService } from "../documents/github-sync.service";

const FIXTURE_OWNER = "hoonapps";
const FIXTURE_REPO = "opspilot-docs";
const EXPECTED_SOURCE_PATH = `github/${FIXTURE_OWNER}/${FIXTURE_REPO}/public/github-incident-policy.md`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const sync = app.get(GithubSyncService);
    const agent = app.get(AgentService);
    const rootDir = process.env.GITHUB_SYNC_FIXTURE_DIR ?? join(process.cwd(), "../../seed/github-docs");

    const result = await sync.syncLocalFixture({
      owner: FIXTURE_OWNER,
      repo: FIXTURE_REPO,
      branch: "main",
      rootDir
    });

    const response = await agent.ask(
      "GitHub 동기화 문서의 OPS-GH-42 공지에는 무엇을 포함해야 해?",
      { roles: [], teamSlugs: [] },
      "github-sync-smoke"
    );
    const topSource = response.sources[0];
    const hasExpectedSource = topSource?.path === EXPECTED_SOURCE_PATH;
    const hasExpectedAnswer = response.answer.includes("OPS-GH-42") && /partner API|파트너 API/i.test(response.answer);
    const ok = result.documents.length > 0 && hasExpectedSource && hasExpectedAnswer;

    const report = {
      ok,
      syncedDocuments: result.documents,
      topSource: topSource
        ? {
            title: topSource.title,
            path: topSource.path,
            score: topSource.score
          }
        : null,
      answerPreview: response.answer.slice(0, 260)
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error(`GitHub sync smoke test failed: expected top source ${EXPECTED_SOURCE_PATH}`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
