import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const answer = await app
      .get(AgentService)
      .ask("운영 DB에서 merchant balance와 payment state를 직접 수정해도 되는지 근거와 함께 알려줘", ACTOR, "claim-support-smoke");
    const traces = app.get(AnswerTraceService);
    const report = await traces.getClaimSupport(answer.answerId, ACTOR);
    const unauthorizedDenied = await rejectsUnauthorized(traces, answer.answerId);
    const hasSupportedClaim = report.claims.some(
      (claim) =>
        claim.status === "supported" &&
        claim.evidence.some((evidence) => evidence.path === "restricted/production-db-policy.md" && evidence.matchedTokens.length > 0)
    );
    const hasEvidenceShape = report.claims.every(
      (claim) =>
        claim.rank > 0 &&
        claim.text.length > 0 &&
        claim.tokenCount >= claim.matchedTokenCount &&
        claim.supportScore >= 0 &&
        claim.supportScore <= 1 &&
        (claim.status === "unsupported" || claim.evidence.length > 0)
    );
    const ok =
      report.schemaVersion === "opspilot.answer_claim_support.v1" &&
      report.answerId === answer.answerId &&
      report.questionId === answer.questionId &&
      report.integrity.algorithm === "sha256" &&
      /^[a-f0-9]{64}$/.test(report.integrity.hash) &&
      report.summary.claimCount === report.claims.length &&
      report.summary.claimCount > 0 &&
      report.summary.sourceAccessRechecked === true &&
      report.summary.supportedClaimCount + report.summary.partialClaimCount + report.summary.unsupportedClaimCount ===
        report.summary.claimCount &&
      report.summary.averageSupportScore >= 0 &&
      report.summary.averageSupportScore <= 1 &&
      report.summary.sourceCoverageCount > 0 &&
      report.thresholds.minSupportedClaimScore > report.thresholds.minPartialClaimScore &&
      report.status !== "unsupported" &&
      hasSupportedClaim &&
      hasEvidenceShape &&
      unauthorizedDenied;

    console.log(
      JSON.stringify(
        {
          ok,
          answerId: answer.answerId,
          questionId: answer.questionId,
          status: report.status,
          summary: report.summary,
          hash: report.integrity.hash,
          claims: report.claims.map((claim) => ({
            rank: claim.rank,
            status: claim.status,
            supportScore: claim.supportScore,
            text: claim.text,
            evidence: claim.evidence.map((item) => ({
              path: item.path,
              supportScore: item.supportScore,
              matchedTokens: item.matchedTokens
            }))
          })),
          unauthorizedDenied
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Answer claim support smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function rejectsUnauthorized(traceService: AnswerTraceService, answerId: string): Promise<boolean> {
  try {
    await traceService.getClaimSupport(answerId, { roles: [], teamSlugs: [] });
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("not accessible");
  }
}
