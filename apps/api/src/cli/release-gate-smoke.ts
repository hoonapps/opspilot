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
    const incident = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", actor, "release-gate-smoke");
    await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", actor, "release-gate-smoke");
    await feedback.create({
      answerId: incident.answerId,
      rating: 1,
      comment: "Release gate smoke confirms launch evidence."
    });

    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
    await evaluations.run("seed-ops-wiki", questions);

    const gate = await observability.releaseGate();
    const checks = Object.fromEntries(gate.checks.map((check) => [check.id, check]));
    const ok =
      gate.status !== "block" &&
      checks.dependencies_ready?.status === "pass" &&
      checks.indexed_knowledge_ready?.status === "pass" &&
      checks.latest_eval_gate?.status === "pass" &&
      checks.slo_guardrails?.status === "pass" &&
      checks.agent_audit_trail?.status !== "fail" &&
      gate.summary.documents >= 5 &&
      gate.summary.chunks >= 8;

    console.log(JSON.stringify({ ok, gate }, null, 2));

    if (!ok) {
      throw new Error("Release gate smoke test failed");
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
