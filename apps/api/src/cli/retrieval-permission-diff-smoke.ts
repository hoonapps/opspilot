import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const QUESTION = "운영 DB에서 고객 정보를 바로 수정해도 돼?";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.ingestSeedDocuments();
    const report = await agent.analyzeRetrievalPermissionDiff(
      QUESTION,
      { roles: [], teamSlugs: [] },
      [
        { id: "public_viewer", label: "공개 사용자", roles: [], teamSlugs: [] },
        { id: "support_agent", label: "고객지원 담당자", roles: ["support_agent"], teamSlugs: [] },
        { id: "payments_oncall", label: "결제 온콜", roles: ["support_agent", "oncall"], teamSlugs: ["payments"] },
        { id: "ops_admin", label: "운영 관리자", roles: ["ops_admin"], teamSlugs: ["payments"] }
      ],
      5
    );
    const publicRun = report.personas.find((persona) => persona.id === "public_viewer");
    const paymentsRun = report.personas.find((persona) => persona.id === "payments_oncall");
    const adminRun = report.personas.find((persona) => persona.id === "ops_admin");
    const checks = Object.fromEntries(report.checks.map((check) => [check.id, check.status]));
    const publicHasRestricted = publicRun?.candidates.some((candidate) => candidate.visibility === "restricted") ?? true;
    const paymentsHasTeam = paymentsRun?.candidates.some((candidate) => candidate.visibility === "team") ?? false;
    const adminHasRestricted = adminRun?.candidates.some((candidate) => candidate.visibility === "restricted") ?? false;
    const adminRestrictedPath = adminRun?.candidates.find((candidate) => candidate.visibility === "restricted")?.path ?? null;
    const ok =
      report.schemaVersion === "opspilot.retrieval_permission_diff.v1" &&
      report.status === "isolated" &&
      report.personas.length === 4 &&
      checks.restricted_isolation === "pass" &&
      checks.team_scope === "pass" &&
      checks.privileged_visibility === "pass" &&
      !publicHasRestricted &&
      paymentsHasTeam &&
      adminHasRestricted &&
      adminRestrictedPath === "restricted/production-db-policy.md" &&
      report.comparisons.some((comparison) => comparison.topSourceChanged);

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          summary: report.summary,
          checks,
          personas: report.personas.map((persona) => ({
            id: persona.id,
            roles: persona.roles,
            teamSlugs: persona.teamSlugs,
            deniedCandidateCount: persona.deniedCandidateCount,
            topSourcePath: persona.topSourcePath,
            topSourceVisibility: persona.topSourceVisibility,
            candidatePaths: persona.candidates.map((candidate) => `${candidate.visibility}:${candidate.path}`)
          })),
          comparisons: report.comparisons
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Retrieval permission diff smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
