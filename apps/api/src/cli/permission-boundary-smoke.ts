import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { AuthzService } from "../authz/authz.service";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const question = "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?";
    const response = await app.get(AgentService).ask(question, { roles: [], teamSlugs: [] }, "permission-boundary-smoke");
    const matrix = await app.get(AuthzService).getPermissionBoundaryMatrix();
    const restrictedSourceReturned = response.sources.some((source) => source.path.startsWith("restricted/"));
    const restrictedDenied = response.permissionAudit.deniedByVisibility.restricted ?? 0;
    const restrictedDocument = matrix.documents.find((document) => document.visibility === "restricted");
    const publicDocument = matrix.documents.find((document) => document.visibility === "public");
    const teamDocument = matrix.documents.find((document) => document.visibility === "team");
    const anonymousRestrictedDecision = restrictedDocument?.decisions.find((decision) => decision.persona === "anonymous");
    const opsAdminRestrictedDecision = restrictedDocument?.decisions.find((decision) => decision.persona === "ops_admin");
    const securityAdminRestrictedDecision = restrictedDocument?.decisions.find((decision) => decision.persona === "security_admin");
    const anonymousPublicDecision = publicDocument?.decisions.find((decision) => decision.persona === "anonymous");
    const teamPersona = matrix.policy.personas.find((persona) => persona.id.endsWith("_oncall"));
    const teamDecision = teamPersona
      ? teamDocument?.decisions.find((decision) => decision.persona === teamPersona.id)
      : undefined;
    const ok =
      !restrictedSourceReturned &&
      response.permissionAudit.deniedCandidateCount > 0 &&
      restrictedDenied > 0 &&
      matrix.documents.length > 0 &&
      anonymousRestrictedDecision?.allowed === false &&
      opsAdminRestrictedDecision?.allowed === true &&
      securityAdminRestrictedDecision?.allowed === true &&
      anonymousPublicDecision?.allowed === true &&
      teamDecision?.allowed === true;

    const report = {
      ok,
      questionId: response.questionId,
      returnedSources: response.sources.map((source) => source.path),
      permissionAudit: response.permissionAudit,
      matrix: {
        documents: matrix.documents.length,
        personas: matrix.policy.personas.map((persona) => persona.id),
        summary: matrix.summary,
        restricted: restrictedDocument
          ? {
              path: restrictedDocument.path,
              anonymous: anonymousRestrictedDecision,
              opsAdmin: opsAdminRestrictedDecision,
              securityAdmin: securityAdminRestrictedDecision
            }
          : null,
        team: teamDocument
          ? {
              path: teamDocument.path,
              persona: teamPersona?.id,
              decision: teamDecision
            }
          : null
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Permission boundary smoke test failed: restricted candidates must be denied without becoming answer sources");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
