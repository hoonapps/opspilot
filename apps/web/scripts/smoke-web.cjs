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

    await page.getByRole("button", { name: "사용법 OpsPilot 사용법" }).click();
    await page.getByRole("heading", { name: "OpsPilot 사용법" }).waitFor({ timeout: 10000 });
    await page.locator(".usagePanel").getByText("로컬 데모 실행 순서", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".usagePanel").getByText("문서를 어디서 관리하나?", { exact: true }).waitFor({ timeout: 10000 });
    const usageVisible = await page.locator(".usagePanel").getByText("문서 화면", { exact: false }).first().isVisible();
    await page.goto(`${baseUrl}/usage`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "사용법" }).waitFor({ timeout: 10000 });
    await page.getByText("로컬 데모 실행 순서", { exact: true }).waitFor({ timeout: 10000 });
    const usagePageVisible = await page.getByText("문서 일치율은 어디서 보나?", { exact: true }).isVisible();
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "품질 품질 게이트와 운영 지표" }).click();
    await page.getByRole("button", { name: "평가 불러오기" }).click();
    await page.getByText("출처 적중", { exact: false }).waitFor({ timeout: 10000 });
    await page.getByText("문서 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalGrid").getByText("인용", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalPanel .sectionHeader").getByText("통과", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("seed-ops-wiki", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistory").getByText("회귀 이력", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistoryItem").first().getByText("Δ 일치", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalSourceCompare").getByText("public/payment-error-codes.md", { exact: false }).first().waitFor({
      timeout: 10000
    });
    const evaluationVisible = await page.getByText("사람 검토", { exact: true }).first().isVisible();
    const documentMatchVisible = await page.getByText("문서 일치율", { exact: true }).first().isVisible();
    const citationVisible = await page.getByText("인용", { exact: true }).first().isVisible();
    const qualityGatePassed = await page.locator(".evalPanel .sectionHeader").getByText("통과", { exact: true }).isVisible();
    const evalHistoryVisible = await page.locator(".evalHistory").getByText("회귀 이력", { exact: true }).isVisible();
    const evalHistoryDeltaVisible = await page.locator(".evalHistoryItem").first().getByText("Δ 일치", { exact: false }).isVisible();
    const evalCaseExplorerVisible = await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).isVisible();
    const evalSourceCompareVisible = await page
      .locator(".evalSourceCompare")
      .getByText("public/payment-error-codes.md", { exact: false })
      .first()
      .isVisible();

    await page.getByRole("button", { name: "문서 지식 베이스 관리" }).click();
    await page.getByRole("heading", { name: "지식 베이스 관리" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "등록하고 RAG 검증" }).waitFor({ timeout: 10000 });
    const githubSyncFormVisible = await page.getByRole("button", { name: "GitHub 문서 동기화" }).isVisible();
    const indexInventoryVisible = await page.getByText("색인 현황과 청크", { exact: true }).isVisible();
    await page.getByRole("button", { name: "큐 상태 불러오기" }).click();
    await page.locator(".queuePanel").getByText("BullMQ 큐 관제", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".queuePanel").getByText("opspilot.indexing", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".queuePanel").getByText("동시성", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "현재 Markdown 큐 등록" }).click();
    await page.locator(".queueNotice").getByText("public/status-page-policy.md", { exact: false }).waitFor({ timeout: 10000 });
    const queuePanelVisible =
      (await page.locator(".queuePanel").getByText("BullMQ 큐 관제", { exact: true }).isVisible()) &&
      (await page.locator(".queuePanel").getByText("opspilot.indexing", { exact: true }).isVisible()) &&
      (await page.locator(".queueNotice").getByText("public/status-page-policy.md", { exact: false }).isVisible());

    await page.getByRole("button", { name: "등록하고 RAG 검증" }).click();
    await page.getByText("상태 페이지 장애 공지 기준 문서가 청크", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".documentList").getByText("public/status-page-policy.md", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".chunkItem span").getByText("고객 공지 SLA", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".securityLine").getByText("해시:", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".securityLine").getByText("프롬프트 주입:", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".indexProof").getByText("색인 문서 검색 성공", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexProof").getByText("출처 적중", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofDetails").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("버전 이력", { exact: true }).waitFor({ timeout: 10000 });
    const currentMarkdown = await page.getByLabel("Markdown").inputValue();
    await page.getByLabel("Markdown").fill(`${currentMarkdown}\n\nWEB-DIFF-42: 문서 버전 변경 차이 검증용 라인입니다.`);
    await page.getByRole("button", { name: "등록하고 RAG 검증" }).click();
    await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("WEB-DIFF-42", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "매트릭스 불러오기" }).click();
    await page.locator(".permissionMatrixPanel").getByText("문서 접근 시뮬레이터", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("Production Database Access Policy", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("허용", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("차단", { exact: true }).first().waitFor({ timeout: 10000 });
    const inventoryVisible = await page.locator(".inventoryStats").getByText("문서", { exact: true }).isVisible();
    const chunkPreviewVisible = await page
      .locator(".chunkInspector")
      .getByText("첫 상태 페이지 공지는 15분 안에", { exact: false })
      .first()
      .isVisible();
    const securitySummaryVisible = await page.locator(".securityLine").getByText("마스킹:", { exact: false }).isVisible();
    const promptInjectionSummaryVisible = await page.locator(".securityLine").getByText("프롬프트 주입:", { exact: false }).isVisible();
    const indexProofVisible = await page.locator(".indexProof").getByText("색인 문서 검색 성공", { exact: true }).isVisible();
    const indexProofSourceHitVisible = await page.locator(".indexProof").getByText("출처 적중", { exact: true }).isVisible();
    const versionHistoryVisible = await page.locator(".versionPanel").getByText("버전 이력", { exact: true }).isVisible();
    const versionDiffVisible = await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).isVisible();
    const permissionMatrixVisible = await page.locator(".permissionMatrixPanel").getByText("문서 접근 시뮬레이터", { exact: true }).isVisible();
    const permissionMatrixDenyVisible = await page.locator(".matrixTable").getByText("차단", { exact: true }).first().isVisible();

    await page.getByRole("button", { name: "검색 RAG 검색 실험실" }).click();
    await page.getByLabel("검색 질문").fill("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
    await page.getByLabel("역할").fill("support_agent");
    await page.getByRole("button", { name: "검색 미리보기" }).click();
    await page.locator(".candidateHead p").getByText("public/status-page-policy.md", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("벡터", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("키워드", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".retrievalDiagnostics").getByText("검색 품질 진단", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticStats").getByText("신뢰도 추정", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticBanner").getByText("컨텍스트 예산", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticChecks").getByText("권한 경계", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextChunkList").getByText("tokens", { exact: false }).first().waitFor({ timeout: 10000 });

    await page.getByLabel("검색 질문").fill("운영 DB에서 고객 정보를 바로 수정해도 돼?");
    await page.getByRole("button", { name: "검색 미리보기" }).click();
    await page.locator(".retrievalPanel").getByText("차단", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".opsBreakdown").getByText("제한", { exact: false }).waitFor({ timeout: 10000 });
    const retrievalPreviewVisible = await page.locator(".candidateList").getByText("종합", { exact: true }).first().isVisible();
    const retrievalScoreVisible = await page.locator(".scoreBars").getByText("키워드", { exact: true }).first().isVisible();
    const retrievalBoundaryVisible = await page.locator(".opsBreakdown").getByText("제한", { exact: false }).isVisible();
    const retrievalDiagnosticsVisible =
      (await page.locator(".retrievalDiagnostics").getByText("검색 품질 진단", { exact: true }).isVisible()) &&
      (await page.locator(".diagnosticChecks").getByText("권한 경계", { exact: true }).isVisible()) &&
      (await page.locator(".contextChunkList").getByText("tokens", { exact: false }).first().isVisible());

    await page.getByRole("button", { name: "질문 운영 문서에 질문하기" }).click();
    await page
      .getByLabel("질문")
      .fill("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
    await page.getByRole("button", { name: "OpsPilot에 질문" }).click();
    const answerPanel = page.locator(".answerPanel pre");
    await answerPanel.getByText("첫 상태 페이지 공지는 15분 안에", { exact: false }).waitFor({
      timeout: 10000
    });
    await page.locator(".sourceList").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({
      timeout: 10000
    });

    await page.getByRole("button", { name: "도움됨" }).click();
    await page.locator(".inlineStatus").getByText("피드백 저장됨", { exact: false }).waitFor({ timeout: 10000 });
    const feedbackSaved = await page.locator(".inlineStatus").getByText("피드백 저장됨", { exact: false }).isVisible();

    await page.getByRole("button", { name: "운영 DB에서 고객 정보를 바로 수정해도 돼?" }).click();
    await page.getByRole("button", { name: "OpsPilot에 질문" }).click();
    await page.locator(".answerMeta").getByText("request_human_approval", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".answerMeta").getByText("문서 일치율", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".answerMeta").getByText("멱등성 신규", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".boundaryAudit").getByText("차단 후보", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".reviewReasons").getByText("민감 작업", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("추적", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceSummary").getByText("승인", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("근거 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("source_token_overlap_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("컨텍스트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextPanel").getByText("컨텍스트 예산", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextPanel").getByText("ranked_context_budget_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("증명 패킷", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("검사 통과율", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("출처 접근 재검사", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".proofPanel").getByText("승인 경계", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".replayPanel").getByText("답변 변경 감지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".replayPanel").getByText("현재 문서 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".replayPanel").getByText("권한 경계 재실행", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator("[aria-label='답변 증거 번들']").getByText("증거 번들", { exact: true }).waitFor({
      timeout: 10000
    });
    await page
      .locator("[aria-label='답변 증거 번들']")
      .getByText("opspilot.answer_evidence_bundle.v1", { exact: true })
      .waitFor({ timeout: 10000 });
    await page.locator("[aria-label='답변 증거 번들']").getByText("sha256:", { exact: false }).waitFor({
      timeout: 10000
    });
    await page.locator(".traceTimeline").getByText("질문 저장", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("답변 생성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceTimeline").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    const boundaryAuditVisible = await page.locator(".boundaryAudit").getByText("검색 전 SQL 권한 필터", { exact: false }).isVisible();
    const reviewReasonVisible = await page.locator(".reviewReasons").getByText("민감 작업", { exact: false }).isVisible();
    const traceVisible = await page.locator(".tracePanel").getByText("추적 새로고침", { exact: true }).isVisible();
    const traceTimelineVisible = await page.locator(".traceTimeline").getByText("답변 생성", { exact: true }).isVisible();
    const groundingVisible = await page.locator(".groundingPanel").getByText("근거 커버리지", { exact: true }).isVisible();
    const contextPackageVisible = await page.locator(".contextPanel").getByText("컨텍스트 예산", { exact: true }).isVisible();
    const proofPacketVisible =
      (await page.locator(".proofPanel").getByText("증명 패킷", { exact: true }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("검사 통과율", { exact: false }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("승인 경계", { exact: true }).isVisible()) &&
      (await page.locator(".proofPanel").getByText("피드백 저장", { exact: true }).isVisible());
    const replayDriftVisible =
      (await page.locator(".replayPanel").getByText("답변 변경 감지", { exact: true }).isVisible()) &&
      (await page.locator(".replayPanel").getByText("현재 문서 일치율", { exact: true }).isVisible()) &&
      (await page.locator(".replayPanel").getByText("권한 경계 재실행", { exact: true }).isVisible());
    const evidenceBundleVisible =
      (await page.locator("[aria-label='답변 증거 번들']").getByText("증거 번들", { exact: true }).isVisible()) &&
      (await page
        .locator("[aria-label='답변 증거 번들']")
        .getByText("opspilot.answer_evidence_bundle.v1", { exact: true })
        .isVisible()) &&
      (await page.locator("[aria-label='답변 증거 번들']").getByText("sha256:", { exact: false }).isVisible());
    const answerText = await answerPanel.innerText();
    const sourceText = await page.locator(".sourceList").innerText();
    const metaText = await page.locator(".answerMeta").innerText();

    await page.getByRole("button", { name: "승인 사람 승인 대기열" }).click();
    await page.locator(".approvalList").getByText("sensitive_operation", { exact: false }).first().waitFor({ timeout: 10000 });
    const approvalText = await page.locator(".approvalList").innerText();
    await page.locator(".approvalList").getByRole("button", { name: "반려" }).first().click();

    await page.getByRole("button", { name: "감사 도구 호출 감사" }).click();
    await page.getByRole("button", { name: "레지스트리 불러오기" }).click();
    await page.locator(".toolRegistry").getByText("search_documents", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("사람 승인 필요", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Slack 시뮬레이션" }).click();
    await page.locator(".slackProof").getByText("로컬 시뮬레이션", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("COPSDEMO", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("UOPSDEMO", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".slackProof").getByText("search_documents", { exact: false }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "도구 호출 불러오기" }).click();
    await page.locator(".auditList").getByText("request_human_approval", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".auditList").getByText("승인 필요", { exact: false }).first().waitFor({ timeout: 10000 });
    const toolRegistryVisible = await page.locator(".toolRegistry").getByText("search_documents", { exact: true }).isVisible();
    const toolRegistryApprovalVisible = await page.locator(".toolRegistry").getByText("사람 승인 필요", { exact: true }).isVisible();
    const slackProofVisible = await page.locator(".slackProof").getByText("로컬 시뮬레이션", { exact: true }).isVisible();
    const slackTraceVisible =
      (await page.locator(".slackProof").getByText("COPSDEMO", { exact: true }).isVisible()) &&
      (await page.locator(".slackProof").getByText("search_documents", { exact: false }).isVisible());
    const auditVisible = await page.locator(".auditList").getByText("search_documents", { exact: false }).first().isVisible();

    await page.getByRole("button", { name: "품질 품질 게이트와 운영 지표" }).click();
    await page.getByRole("button", { name: "운영 지표 불러오기" }).click();
    await page.locator(".releaseGatePanel").getByText("릴리즈 게이트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("의존성 준비", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("최신 평가 게이트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("평가 최신성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("SLO 가드레일", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("사람 검토율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("평균 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("SLO 가드레일", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("답변 근거성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("도구 감사 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page
      .locator(".observabilityPanel")
      .getByText("request_human_approval", { exact: false })
      .first()
      .waitFor({ timeout: 10000 });
    await page
      .locator(".observabilityPanel")
      .getByText("승인 필요", { exact: false })
      .first()
      .waitFor({ timeout: 10000 });
    const observabilityText = await page.locator(".observabilityPanel").innerText();
    const normalizedObservabilityText = observabilityText.toLowerCase();
    const observabilityVisible =
      observabilityText.includes("릴리즈 게이트") &&
      observabilityText.includes("의존성 준비") &&
      observabilityText.includes("최신 평가 게이트") &&
      observabilityText.includes("평가 최신성") &&
      observabilityText.includes("사람 검토율") &&
      observabilityText.includes("평균 일치율") &&
      observabilityText.includes("SLO 가드레일") &&
      observabilityText.includes("답변 근거성") &&
      observabilityText.includes("도구 감사 커버리지") &&
      observabilityText.includes("request_human_approval") &&
      observabilityText.includes("피드백");

    await page.getByRole("button", { name: "질문 운영 문서에 질문하기" }).click();
    await page.locator("[aria-label='답변 증거 번들']").scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const report = {
      ok:
        answerText.includes("담당자 확인") &&
        sourceText.length > 0 &&
        metaText.includes("request_human_approval") &&
        metaText.includes("문서 일치율") &&
        metaText.includes("멱등성 신규") &&
        approvalText.includes("sensitive_operation") &&
        feedbackSaved &&
        githubSyncFormVisible &&
        indexInventoryVisible &&
        queuePanelVisible &&
        inventoryVisible &&
        chunkPreviewVisible &&
        securitySummaryVisible &&
        promptInjectionSummaryVisible &&
        indexProofVisible &&
        indexProofSourceHitVisible &&
        versionHistoryVisible &&
        versionDiffVisible &&
        permissionMatrixVisible &&
        permissionMatrixDenyVisible &&
        retrievalPreviewVisible &&
        retrievalScoreVisible &&
        retrievalBoundaryVisible &&
        retrievalDiagnosticsVisible &&
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
        replayDriftVisible &&
        evidenceBundleVisible &&
        toolRegistryVisible &&
        toolRegistryApprovalVisible &&
        slackProofVisible &&
        slackTraceVisible &&
        auditVisible &&
        observabilityVisible &&
        usageVisible &&
        usagePageVisible,
      baseUrl,
      screenshotPath,
      checks: {
        sensitiveAnswerNeedsReview: answerText.includes("담당자 확인"),
        sourcesVisible: sourceText.length > 0,
        approvalToolCallVisible: metaText.includes("request_human_approval"),
        documentAgreementVisible: metaText.includes("문서 일치율"),
        idempotencyVisible: metaText.includes("멱등성 신규"),
        approvalQueueVisible: approvalText.includes("sensitive_operation"),
        feedbackSaved,
        githubSyncFormVisible,
        indexInventoryVisible,
        queuePanelVisible,
        inventoryVisible,
        chunkPreviewVisible,
        securitySummaryVisible,
        promptInjectionSummaryVisible,
        indexProofVisible,
        indexProofSourceHitVisible,
        versionHistoryVisible,
        versionDiffVisible,
        permissionMatrixVisible,
        permissionMatrixDenyVisible,
        retrievalPreviewVisible,
        retrievalScoreVisible,
        retrievalBoundaryVisible,
        retrievalDiagnosticsVisible,
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
        replayDriftVisible,
        evidenceBundleVisible,
        toolRegistryVisible,
        toolRegistryApprovalVisible,
        slackProofVisible,
        slackTraceVisible,
        auditVisible,
        observabilityVisible,
        usageVisible,
        usagePageVisible
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
