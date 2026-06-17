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
    const feedback = app.get(FeedbackService);
    const evaluations = app.get(EvaluationService);
    const observability = app.get(ObservabilityService);

    await documents.ingestSeedDocuments();

    const actor = { roles: ["ops_admin"], teamSlugs: ["payments"] };
    const incident = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", actor, "observability-slo-smoke");
    await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", actor, "observability-slo-smoke");
    await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", actor, "observability-slo-smoke");

    await feedback.create({
      answerId: incident.answerId,
      rating: 1,
      comment: "SLO smoke confirms quality guardrails."
    });

    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
    await evaluations.run("seed-ops-wiki", questions);

    const report = await observability.slo();
    const objectives = Object.fromEntries(report.objectives.map((objective) => [objective.id, objective]));
    const ok =
      report.status === "ok" &&
      objectives.answer_grounding?.status === "ok" &&
      objectives.review_load?.status === "ok" &&
      objectives.tool_audit_coverage?.status === "ok" &&
      objectives.eval_gate?.status === "ok" &&
      objectives.api_success_rate?.status === "ok" &&
      objectives.answer_grounding.actual >= objectives.answer_grounding.target &&
      objectives.api_success_rate.actual >= objectives.api_success_rate.target &&
      objectives.tool_audit_coverage.actual >= objectives.tool_audit_coverage.target;

    console.log(JSON.stringify({ ok, report }, null, 2));

    if (!ok) {
      throw new Error("Observability SLO smoke test failed");
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
