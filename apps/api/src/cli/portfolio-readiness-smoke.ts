import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";
import { FeedbackService } from "../feedback/feedback.service";
import { ObservabilityService } from "../observability/observability.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const evaluations = app.get(EvaluationService);
    const feedback = app.get(FeedbackService);
    const observability = app.get(ObservabilityService);

    await documents.ingestSeedDocuments();

    const actor = { roles: ["ops_admin"], teamSlugs: ["payments"] };
    const groundingAnswer = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", actor, "portfolio-readiness-smoke");
    await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", actor, "portfolio-readiness-smoke");
    await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", actor, "portfolio-readiness-smoke");
    await feedback.create({
      answerId: groundingAnswer.answerId,
      rating: 1,
      comment: "Product readiness smoke confirms local proof evidence."
    });

    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
    await evaluations.run("seed-ops-wiki", questions);

    const report = await observability.portfolioReadiness();
    const requiredPillars = ["rag_grounding", "permission_boundary", "tool_audit", "operational_reliability", "demo_artifacts"];
    const pillarsById = Object.fromEntries(report.pillars.map((pillar) => [pillar.id, pillar]));
    const ok =
      report.schemaVersion === "opspilot.portfolio_readiness.v1" &&
      report.status !== "block" &&
      report.score >= 0.75 &&
      report.summary.documents >= 5 &&
      report.summary.chunks >= 8 &&
      report.summary.averageDocumentAgreement > 0 &&
      report.summary.apiSuccessRate >= 0.95 &&
      report.demoPath.length >= 5 &&
      requiredPillars.every((id) => pillarsById[id]?.status !== "fail") &&
      report.pillars.every((pillar) => pillar.verification.length > 0 && pillar.links.length > 0);

    console.log(JSON.stringify({ ok, report }, null, 2));

    if (!ok) {
      throw new Error("Product readiness smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function resolveEvalPath(evalPath: string): string {
  return isAbsolute(evalPath) ? evalPath : resolve(join(process.cwd(), evalPath));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
