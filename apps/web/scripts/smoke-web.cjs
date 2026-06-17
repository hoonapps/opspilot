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
    await page.getByText("Citation", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalPanel").getByText("Passed", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("seed-ops-wiki", { exact: false }).waitFor({ timeout: 10000 });
    const evaluationVisible = await page.getByText("Human review", { exact: true }).first().isVisible();
    const documentMatchVisible = await page.getByText("Document match", { exact: true }).first().isVisible();
    const citationVisible = await page.getByText("Citation", { exact: true }).first().isVisible();
    const qualityGatePassed = await page.locator(".evalPanel").getByText("Passed", { exact: true }).isVisible();

    await page.getByRole("button", { name: /Documents/ }).click();
    await page.getByRole("heading", { name: "Manage knowledge base" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Upsert document" }).waitFor({ timeout: 10000 });
    const githubSyncFormVisible = await page.getByRole("button", { name: "Sync GitHub docs" }).isVisible();
    const indexInventoryVisible = await page.getByText("Index inventory and chunks", { exact: true }).isVisible();

    await page.getByRole("button", { name: "Upsert document" }).click();
    await page.getByText("Status Page Incident Communication indexed as", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".documentList").getByText("public/status-page-policy.md", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".chunkItem span").getByText("Customer Notice SLA", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".securityLine").getByText("hash:", { exact: false }).waitFor({ timeout: 10000 });
    const inventoryVisible = await page.locator(".inventoryStats").getByText("Documents", { exact: true }).isVisible();
    const chunkPreviewVisible = await page.locator(".chunkInspector").getByText("publish the first status page notice", { exact: false }).isVisible();
    const securitySummaryVisible = await page.locator(".securityLine").getByText("redacted:", { exact: false }).isVisible();

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
    await page.locator(".traceTimeline").getByText("Question persisted", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("Answer generated", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    const boundaryAuditVisible = await page.locator(".boundaryAudit").getByText("pre_ranking_sql_filter", { exact: false }).isVisible();
    const reviewReasonVisible = await page.locator(".reviewReasons").getByText("sensitive action", { exact: false }).isVisible();
    const traceVisible = await page.locator(".tracePanel").getByText("Refresh trace", { exact: true }).isVisible();
    const traceTimelineVisible = await page.locator(".traceTimeline").getByText("Answer generated", { exact: true }).isVisible();
    const answerText = await answerPanel.innerText();
    const sourceText = await page.locator(".sourceList").innerText();
    const metaText = await page.locator(".answerMeta").innerText();

    await page.getByRole("button", { name: /Review/ }).click();
    await page.locator(".approvalList").getByText("sensitive_operation", { exact: false }).first().waitFor({ timeout: 10000 });
    const approvalText = await page.locator(".approvalList").innerText();
    await page.locator(".approvalList").getByRole("button", { name: "Reject" }).first().click();

    await page.getByRole("button", { name: /Audit/ }).click();
    await page.getByRole("button", { name: "Load tools" }).click();
    await page.locator(".auditList").getByText("request_human_approval", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".auditList").getByText("needs_approval", { exact: false }).first().waitFor({ timeout: 10000 });
    const auditVisible = await page.locator(".auditList").getByText("search_documents", { exact: false }).first().isVisible();

    await page.getByRole("button", { name: /Quality/ }).click();
    await page.getByRole("button", { name: "Load ops" }).click();
    await page.locator(".observabilityPanel").getByText("Human review rate", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("Avg match", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("request_human_approval", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("needs_approval", { exact: false }).waitFor({ timeout: 10000 });
    const observabilityText = await page.locator(".observabilityPanel").innerText();
    const observabilityVisible =
      observabilityText.includes("Human review rate") &&
      observabilityText.includes("Avg match") &&
      observabilityText.includes("request_human_approval") &&
      observabilityText.includes("Feedback");

    await page.getByRole("button", { name: /Retrieval/ }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
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
        retrievalPreviewVisible &&
        retrievalScoreVisible &&
        retrievalBoundaryVisible &&
        evaluationVisible &&
        documentMatchVisible &&
        citationVisible &&
        qualityGatePassed &&
        boundaryAuditVisible &&
        reviewReasonVisible &&
        traceVisible &&
        traceTimelineVisible &&
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
        retrievalPreviewVisible,
        retrievalScoreVisible,
        retrievalBoundaryVisible,
        evaluationVisible,
        documentMatchVisible,
        citationVisible,
        qualityGatePassed,
        boundaryAuditVisible,
        reviewReasonVisible,
        traceVisible,
        traceTimelineVisible,
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
