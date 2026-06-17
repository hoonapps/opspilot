import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { AnswerLineageGraph, AnswerTraceService } from "../agent/answer-trace.service";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";

const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const agent = app.get(AgentService);
    const answer = await agent.ask(
      "운영 DB에서 고객 정보를 바로 수정해도 되는지 근거와 승인 경계를 설명해줘",
      ACTOR,
      "answer-lineage-smoke"
    );
    await app.get(FeedbackService).create({ answerId: answer.answerId, rating: 1, comment: "계보 그래프 smoke 피드백" });

    const lineage = await app.get(AnswerTraceService).getLineageGraph(answer.answerId, ACTOR);
    const nodeKinds = new Set(lineage.nodes.map((node) => node.kind));
    const edgeKinds = new Set(lineage.edges.map((edge) => edge.kind));
    const requiredNodeKinds: Array<AnswerLineageGraph["nodes"][number]["kind"]> = [
      "question",
      "answer",
      "source",
      "tool",
      "approval",
      "feedback",
      "gate"
    ];
    const requiredEdgeKinds: Array<AnswerLineageGraph["edges"][number]["kind"]> = [
      "created",
      "grounded_by",
      "called",
      "requires",
      "rated",
      "checks"
    ];
    const ok =
      lineage.schemaVersion === "opspilot.answer_lineage_graph.v1" &&
      lineage.answerId === answer.answerId &&
      lineage.questionId === answer.questionId &&
      lineage.integrity.algorithm === "sha256" &&
      /^[a-f0-9]{64}$/.test(lineage.integrity.hash) &&
      lineage.summary.sourceAccessRechecked === true &&
      lineage.summary.nodeCount === lineage.nodes.length &&
      lineage.summary.edgeCount === lineage.edges.length &&
      lineage.summary.sourceCount >= 1 &&
      lineage.summary.toolCallCount >= 1 &&
      lineage.summary.approvalCount >= 1 &&
      lineage.summary.feedbackCount >= 1 &&
      lineage.summary.restrictedSourceCount >= 1 &&
      lineage.status === "review_required" &&
      requiredNodeKinds.every((kind) => nodeKinds.has(kind)) &&
      requiredEdgeKinds.every((kind) => edgeKinds.has(kind)) &&
      lineage.edges.some((edge) => edge.from.startsWith("source:") && edge.to.startsWith("answer:")) &&
      lineage.edges.some((edge) => edge.from.startsWith("approval:") && edge.to.startsWith("gate:"));

    console.log(
      JSON.stringify(
        {
          ok,
          status: lineage.status,
          nodeCount: lineage.summary.nodeCount,
          edgeCount: lineage.summary.edgeCount,
          sourceCount: lineage.summary.sourceCount,
          toolCallCount: lineage.summary.toolCallCount,
          approvalCount: lineage.summary.approvalCount,
          feedbackCount: lineage.summary.feedbackCount,
          restrictedSourceCount: lineage.summary.restrictedSourceCount,
          hash: lineage.integrity.hash
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Answer lineage smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
