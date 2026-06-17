const { chromium } = require("@playwright/test");
const { isAbsolute, join } = require("node:path");

const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3001";
const repoRoot = join(__dirname, "../../..");
const screenshotPath = process.env.SCREENSHOT_PATH
  ? isAbsolute(process.env.SCREENSHOT_PATH)
    ? process.env.SCREENSHOT_PATH
    : join(repoRoot, process.env.SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-web-console.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Quality/ }).click();
    await page.getByRole("button", { name: "Load eval" }).click();
    await page.getByText("Source hit", { exact: false }).waitFor({ timeout: 10000 });
    await page.getByText("Document match", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalGrid").getByText("Citation", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalPanel .sectionHeader").getByText("Passed", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("seed-ops-wiki", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistory").getByText("Regression history", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistoryItem").first().getByText("Δ Match", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalSourceCompare").getByText("public/payment-error-codes.md", { exact: false }).first().waitFor({
      timeout: 10000
    });
    const evaluationVisible = await page.getByText("Human review", { exact: true }).first().isVisible();
    const documentMatchVisible = await page.getByText("Document match", { exact: true }).first().isVisible();
    const citationVisible = await page.getByText("Citation", { exact: true }).first().isVisible();
    const qualityGatePassed = await page.locator(".evalPanel .sectionHeader").getByText("Passed", { exact: true }).isVisible();
    const evalHistoryVisible = await page.locator(".evalHistory").getByText("Regression history", { exact: true }).isVisible();
    const evalHistoryDeltaVisible = await page.locator(".evalHistoryItem").first().getByText("Δ Match", { exact: false }).isVisible();
    const evalCaseExplorerVisible = await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).isVisible();
    const evalSourceCompareVisible = await page
      .locator(".evalSourceCompare")
      .getByText("public/payment-error-codes.md", { exact: false })
      .first()
      .isVisible();

    await page.getByRole("button", { name: /Documents/ }).click();
    await page.getByRole("heading", { name: "Manage knowledge base" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Upsert and verify RAG" }).waitFor({ timeout: 10000 });
    const githubSyncFormVisible = await page.getByRole("button", { name: "Sync GitHub docs" }).isVisible();
    const indexInventoryVisible = await page.getByText("Index inventory and chunks", { exact: true }).isVisible();

    await page.getByRole("button", { name: "Upsert and verify RAG" }).click();
    await page.getByText("Status Page Incident Communication indexed as", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".documentList").getByText("public/status-page-policy.md", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".chunkItem span").getByText("Customer Notice SLA", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".securityLine").getByText("hash:", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".indexProof").getByText("Indexed doc is retrievable", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexProof").getByText("Source hit", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofDetails").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("Version history", { exact: true }).waitFor({ timeout: 10000 });
    const currentMarkdown = await page.getByLabel("Markdown").inputValue();
    await page.getByLabel("Markdown").fill(`${currentMarkdown}\n\nWEB-DIFF-42: version history proof line for document diff inspection.`);
    await page.getByRole("button", { name: "Upsert and verify RAG" }).click();
    await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("WEB-DIFF-42", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Load matrix" }).click();
    await page.locator(".permissionMatrixPanel").getByText("Document access simulator", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("Production Database Access Policy", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("Allow", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("Deny", { exact: true }).first().waitFor({ timeout: 10000 });
    const inventoryVisible = await page.locator(".inventoryStats").getByText("Documents", { exact: true }).isVisible();
    const chunkPreviewVisible = await page
      .locator(".chunkInspector")
      .getByText("publish the first status page notice", { exact: false })
      .first()
      .isVisible();
    const securitySummaryVisible = await page.locator(".securityLine").getByText("redacted:", { exact: false }).isVisible();
    const indexProofVisible = await page.locator(".indexProof").getByText("Indexed doc is retrievable", { exact: true }).isVisible();
    const indexProofSourceHitVisible = await page.locator(".indexProof").getByText("Source hit", { exact: true }).isVisible();
    const versionHistoryVisible = await page.locator(".versionPanel").getByText("Version history", { exact: true }).isVisible();
    const versionDiffVisible = await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).isVisible();
    const permissionMatrixVisible = await page.locator(".permissionMatrixPanel").getByText("Document access simulator", { exact: true }).isVisible();
    const permissionMatrixDenyVisible = await page.locator(".matrixTable").getByText("Deny", { exact: true }).first().isVisible();

    await page.getByRole("button", { name: /Retrieval/ }).click();
    await page.getByLabel("Query").fill("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
    await page.getByLabel("Roles").fill("support_agent");
    await page.getByRole("button", { name: "Preview retrieval" }).click();
    await page.locator(".candidateHead p").getByText("public/status-page-policy.md", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("vector", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("lexical", { exact: true }).first().waitFor({ timeout: 10000 });

    await page.getByLabel("Query").fill("운영 DB에서 고객 정보를 바로 수정해도 돼?");
    await page.getByRole("button", { name: "Preview retrieval" }).click();
    await page.locator(".retrievalPanel").getByText("Denied", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".opsBreakdown").getByText("restricted", { exact: false }).waitFor({ timeout: 10000 });
    const retrievalPreviewVisible = await page.locator(".candidateList").getByText("score", { exact: true }).first().isVisible();
    const retrievalScoreVisible = await page.locator(".scoreBars").getByText("lexical", { exact: true }).first().isVisible();
    const retrievalBoundaryVisible = await page.locator(".opsBreakdown").getByText("restricted", { exact: false }).isVisible();

    await page.getByRole("button", { name: /Ask/ }).click();
    await page
      .getByLabel("Question")
      .fill("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
    await page.getByRole("button", { name: "Ask OpsPilot" }).click();
    const answerPanel = page.locator(".answerPanel pre");
    await answerPanel.getByText("publish the first status page notice within 15 minutes", { exact: false }).waitFor({
      timeout: 10000
    });
    await page.locator(".sourceList").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({
      timeout: 10000
    });

    await page.getByRole("button", { name: "Helpful" }).click();
    await page.locator(".inlineStatus").getByText("Feedback saved", { exact: false }).waitFor({ timeout: 10000 });
    const feedbackSaved = await page.locator(".inlineStatus").getByText("Feedback saved", { exact: false }).isVisible();

    await page.getByRole("button", { name: "운영 DB에서 고객 정보를 바로 수정해도 돼?" }).click();
    await page.getByRole("button", { name: "Ask OpsPilot" }).click();
    await page.locator(".answerMeta").getByText("request_human_approval", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".answerMeta").getByText("Match", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".boundaryAudit").getByText("denied candidates", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".reviewReasons").getByText("sensitive action", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("Trace", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("Approvals", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("Coverage", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("Grounding coverage", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("source_token_overlap_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("Context", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextPanel").getByText("Context budget", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextPanel").getByText("ranked_context_budget_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("Proof packet", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("checks passed", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("Source access rechecked", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("Approval boundary", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("Question persisted", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("Answer generated", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    const boundaryAuditVisible = await page.locator(".boundaryAudit").getByText("pre_ranking_sql_filter", { exact: false }).isVisible();
    const reviewReasonVisible = await page.locator(".reviewReasons").getByText("sensitive action", { exact: false }).isVisible();
    const traceVisible = await page.locator(".tracePanel").getByText("Refresh trace", { exact: true }).isVisible();
    const traceTimelineVisible = await page.locator(".traceTimeline").getByText("Answer generated", { exact: true }).isVisible();
    const groundingVisible = await page.locator(".groundingPanel").getByText("Grounding coverage", { exact: true }).isVisible();
    const contextPackageVisible = await page.locator(".contextPanel").getByText("Context budget", { exact: true }).isVisible();
    const proofPacketVisible =
      (await page.locator(".proofPanel").getByText("Proof packet", { exact: true }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("checks passed", { exact: false }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("Approval boundary", { exact: true }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("Feedback captured", { exact: true }).isVisible());
    const answerText = await answerPanel.innerText();
    const sourceText = await page.locator(".sourceList").innerText();
    const metaText = await page.locator(".answerMeta").innerText();

    await page.getByRole("button", { name: /Review/ }).click();
    await page.locator(".approvalList").getByText("sensitive_operation", { exact: false }).first().waitFor({ timeout: 10000 });
    const approvalText = await page.locator(".approvalList").innerText();
    await page.locator(".approvalList").getByRole("button", { name: "Reject" }).first().click();

    await page.getByRole("button", { name: /Audit/ }).click();
    await page.getByRole("button", { name: "Load registry" }).click();
    await page.locator(".toolRegistry").getByText("search_documents", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("Human required", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Simulate Slack" }).click();
    await page.locator(".slackProof").getByText("dry_run", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("COPSDEMO", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("UOPSDEMO", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("search_documents", { exact: false }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Load tools" }).click();
    await page.locator(".auditList").getByText("request_human_approval", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".auditList").getByText("needs_approval", { exact: false }).first().waitFor({ timeout: 10000 });
    const toolRegistryVisible = await page.locator(".toolRegistry").getByText("search_documents", { exact: true }).isVisible();
    const toolRegistryApprovalVisible = await page.locator(".toolRegistry").getByText("Human required", { exact: true }).isVisible();
    const slackProofVisible = await page.locator(".slackProof").getByText("dry_run", { exact: true }).isVisible();
    const slackTraceVisible =
      (await page.locator(".slackProof").getByText("COPSDEMO", { exact: true }).isVisible()) &&
      (await page.locator(".slackProof").getByText("search_documents", { exact: false }).isVisible());
    const auditVisible = await page.locator(".auditList").getByText("search_documents", { exact: false }).first().isVisible();

    await page.getByRole("button", { name: /Quality/ }).click();
    await page.getByRole("button", { name: "Load ops" }).click();
    await page.locator(".observabilityPanel").getByText("Human review rate", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("Avg match", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("SLO guardrails", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("Answer grounding", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("Tool audit coverage", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("request_human_approval", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("needs_approval", { exact: false }).waitFor({ timeout: 10000 });
    const observabilityText = await page.locator(".observabilityPanel").innerText();
    const normalizedObservabilityText = observabilityText.toLowerCase();
    const observabilityVisible =
      normalizedObservabilityText.includes("human review rate") &&
      normalizedObservabilityText.includes("avg match") &&
      normalizedObservabilityText.includes("slo guardrails") &&
      normalizedObservabilityText.includes("answer grounding") &&
      normalizedObservabilityText.includes("tool audit coverage") &&
      observabilityText.includes("request_human_approval") &&
      normalizedObservabilityText.includes("feedback");

    await page.getByRole("button", { name: /Ask/ }).click();
    await page.locator(".proofPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const report = {
      ok:
        answerText.includes("담당자 확인") &&
        sourceText.length > 0 &&
        metaText.includes("request_human_approval") &&
        metaText.includes("Match") &&
        approvalText.includes("sensitive_operation") &&
        feedbackSaved &&
        githubSyncFormVisible &&
        indexInventoryVisible &&
        inventoryVisible &&
        chunkPreviewVisible &&
        securitySummaryVisible &&
        indexProofVisible &&
        indexProofSourceHitVisible &&
        versionHistoryVisible &&
        versionDiffVisible &&
        permissionMatrixVisible &&
        permissionMatrixDenyVisible &&
        retrievalPreviewVisible &&
        retrievalScoreVisible &&
        retrievalBoundaryVisible &&
        evaluationVisible &&
        documentMatchVisible &&
        citationVisible &&
        qualityGatePassed &&
        evalHistoryVisible &&
        evalHistoryDeltaVisible &&
        evalCaseExplorerVisible &&
        evalSourceCompareVisible &&
        boundaryAuditVisible &&
        reviewReasonVisible &&
        traceVisible &&
        traceTimelineVisible &&
        groundingVisible &&
        contextPackageVisible &&
        proofPacketVisible &&
        toolRegistryVisible &&
        toolRegistryApprovalVisible &&
        slackProofVisible &&
        slackTraceVisible &&
        auditVisible &&
        observabilityVisible,
      baseUrl,
      screenshotPath,
      checks: {
        sensitiveAnswerNeedsReview: answerText.includes("담당자 확인"),
        sourcesVisible: sourceText.length > 0,
        approvalToolCallVisible: metaText.includes("request_human_approval"),
        documentAgreementVisible: metaText.includes("Match"),
        approvalQueueVisible: approvalText.includes("sensitive_operation"),
        feedbackSaved,
        githubSyncFormVisible,
        indexInventoryVisible,
        inventoryVisible,
        chunkPreviewVisible,
        securitySummaryVisible,
        indexProofVisible,
        indexProofSourceHitVisible,
        versionHistoryVisible,
        versionDiffVisible,
        permissionMatrixVisible,
        permissionMatrixDenyVisible,
        retrievalPreviewVisible,
        retrievalScoreVisible,
        retrievalBoundaryVisible,
        evaluationVisible,
        documentMatchVisible,
        citationVisible,
        qualityGatePassed,
        evalHistoryVisible,
        evalHistoryDeltaVisible,
        evalCaseExplorerVisible,
        evalSourceCompareVisible,
        boundaryAuditVisible,
        reviewReasonVisible,
        traceVisible,
        traceTimelineVisible,
        groundingVisible,
        contextPackageVisible,
        proofPacketVisible,
        toolRegistryVisible,
        toolRegistryApprovalVisible,
        slackProofVisible,
        slackTraceVisible,
        auditVisible,
        observabilityVisible
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      throw new Error("Web smoke test failed");
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
