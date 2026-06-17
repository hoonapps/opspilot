const { chromium } = require("@playwright/test");
const { isAbsolute, join } = require("node:path");

const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3001";
const repoRoot = join(__dirname, "../../..");
const screenshotPath = process.env.SCREENSHOT_PATH
  ? isAbsolute(process.env.SCREENSHOT_PATH)
    ? process.env.SCREENSHOT_PATH
    : join(repoRoot, process.env.SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-web-console.png");
const retrievalScreenshotPath = process.env.RETRIEVAL_SCREENSHOT_PATH
  ? isAbsolute(process.env.RETRIEVAL_SCREENSHOT_PATH)
    ? process.env.RETRIEVAL_SCREENSHOT_PATH
    : join(repoRoot, process.env.RETRIEVAL_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-retrieval-lab.png");
const groundingScreenshotPath = process.env.GROUNDING_SCREENSHOT_PATH
  ? isAbsolute(process.env.GROUNDING_SCREENSHOT_PATH)
    ? process.env.GROUNDING_SCREENSHOT_PATH
    : join(repoRoot, process.env.GROUNDING_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-answer-grounding.png");
const indexQualityScreenshotPath = process.env.INDEX_QUALITY_SCREENSHOT_PATH
  ? isAbsolute(process.env.INDEX_QUALITY_SCREENSHOT_PATH)
    ? process.env.INDEX_QUALITY_SCREENSHOT_PATH
    : join(repoRoot, process.env.INDEX_QUALITY_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-index-quality.png");
const documentImpactScreenshotPath = process.env.DOCUMENT_IMPACT_SCREENSHOT_PATH
  ? isAbsolute(process.env.DOCUMENT_IMPACT_SCREENSHOT_PATH)
    ? process.env.DOCUMENT_IMPACT_SCREENSHOT_PATH
    : join(repoRoot, process.env.DOCUMENT_IMPACT_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-document-impact.png");
const incidentPlanScreenshotPath = process.env.INCIDENT_PLAN_SCREENSHOT_PATH
  ? isAbsolute(process.env.INCIDENT_PLAN_SCREENSHOT_PATH)
    ? process.env.INCIDENT_PLAN_SCREENSHOT_PATH
    : join(repoRoot, process.env.INCIDENT_PLAN_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-incident-plan.png");
const portfolioReadinessScreenshotPath = process.env.PORTFOLIO_READINESS_SCREENSHOT_PATH
  ? isAbsolute(process.env.PORTFOLIO_READINESS_SCREENSHOT_PATH)
    ? process.env.PORTFOLIO_READINESS_SCREENSHOT_PATH
    : join(repoRoot, process.env.PORTFOLIO_READINESS_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-portfolio-readiness.png");
const auditLedgerScreenshotPath = process.env.AUDIT_LEDGER_SCREENSHOT_PATH
  ? isAbsolute(process.env.AUDIT_LEDGER_SCREENSHOT_PATH)
    ? process.env.AUDIT_LEDGER_SCREENSHOT_PATH
    : join(repoRoot, process.env.AUDIT_LEDGER_SCREENSHOT_PATH)
  : join(repoRoot, "docs/assets/opspilot-audit-ledger.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.locator(".railNav").getByRole("button", { name: /^사용법 / }).click();
    await page.getByRole("heading", { name: "OpsPilot 사용법" }).waitFor({ timeout: 10000 });
    await page.locator(".usagePanel").getByText("로컬 데모 실행과 검증 순서", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".usagePanel").getByText("빠른 실행 명령", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".usagePanel").getByText("문서를 어디서 관리하나?", { exact: true }).waitFor({ timeout: 10000 });
    const usageVisible = await page.locator(".usagePanel").getByText("문서 화면", { exact: false }).first().isVisible();
    await page.goto(`${baseUrl}/usage`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "사용법" }).waitFor({ timeout: 10000 });
    await page.getByText("로컬 데모 실행과 검증 순서", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("빠른 실행 명령", { exact: true }).waitFor({ timeout: 10000 });
    const usagePageVisible = await page.getByText("문서 일치율은 어디서 보나?", { exact: true }).isVisible();
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.locator(".railNav").getByRole("button", { name: /^품질 / }).click();
    await page.getByRole("button", { name: "평가 불러오기" }).click();
    await page.locator(".evalGrid").getByText("출처 적중", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalGrid").getByText("문서 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalGrid").getByText("인용", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalPanel .sectionHeader").getByText("통과", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("seed-ops-wiki", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistory").getByText("회귀 이력", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalHistoryItem").first().getByText("Δ 일치", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".evalCaseReport").getByText("케이스 상세 리포트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalCaseReport").getByText("기대 출처 적중", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evalSourceCompare").getByText("public/payment-error-codes.md", { exact: false }).first().waitFor({
      timeout: 10000
    });
    const evaluationVisible = await page.locator(".evalGrid").getByText("사람 검토", { exact: true }).first().isVisible();
    const documentMatchVisible = await page.locator(".evalGrid").getByText("문서 일치율", { exact: true }).first().isVisible();
    const citationVisible = await page.locator(".evalGrid").getByText("인용", { exact: true }).first().isVisible();
    const qualityGatePassed = await page.locator(".evalPanel .sectionHeader").getByText("통과", { exact: true }).isVisible();
    const evalHistoryVisible = await page.locator(".evalHistory").getByText("회귀 이력", { exact: true }).isVisible();
    const evalHistoryDeltaVisible = await page.locator(".evalHistoryItem").first().getByText("Δ 일치", { exact: false }).isVisible();
    const evalCaseDetailVisible =
      (await page.locator(".evalCaseReport").getByText("케이스 상세 리포트", { exact: true }).isVisible()) &&
      (await page.locator(".evalCaseReport").getByText("기대 출처 적중", { exact: true }).first().isVisible());
    const evalCaseExplorerVisible = await page.locator(".evalCaseExplorer").getByText("error-e102", { exact: true }).isVisible();
    const evalSourceCompareVisible = await page
      .locator(".evalSourceCompare")
      .getByText("public/payment-error-codes.md", { exact: false })
      .first()
      .isVisible();

    await page.locator(".railNav").getByRole("button", { name: /^문서 / }).click();
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
    await page.locator(".indexQualityPanel").getByText("색인 품질 리포트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexQualityPanel").getByText("게이트 통과율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".qualityGateList").getByText("청크 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".qualityDocumentList").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({
      timeout: 10000
    });
    await page.locator(".indexQualityPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: indexQualityScreenshotPath, fullPage: false });
    await page.locator(".proofDetails").getByText("public/status-page-policy.md", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("버전 이력", { exact: true }).waitFor({ timeout: 10000 });
    const currentMarkdown = await page.getByLabel("Markdown").inputValue();
    await page.getByLabel("Markdown").fill(`${currentMarkdown}\n\nWEB-DIFF-42: 문서 버전 변경 차이 검증용 라인입니다.`);
    await page.getByRole("button", { name: "등록하고 RAG 검증" }).click();
    await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".versionPanel").getByText("WEB-DIFF-42", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "색인 설명", exact: true }).click();
    await page.locator(".indexExplainPanel").getByText("색인 준비", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexExplainPanel").getByText("heading_paragraph_window_v1", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".indexExplainPanel").getByText("임베딩 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexExplainPanel").getByText("헤딩 아웃라인", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".indexExplainPanel").getByText("고객 공지 SLA", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "영향 분석", exact: true }).click();
    await page.locator(".impactPanel").getByText("영향 분석", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".impactPanel").getByText("재검증 필요", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".impactPanel").getByText("고객 공지 SLA와 15분 공지 기준", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".impactPanel").scrollIntoViewIfNeeded();
    await page.locator(".impactPanel").screenshot({ path: documentImpactScreenshotPath });
    await page.getByRole("button", { name: "매트릭스 불러오기" }).click();
    await page.locator(".permissionMatrixPanel").getByText("문서 접근 시뮬레이터", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".matrixTable").getByText("운영 데이터베이스 접근 정책", { exact: false }).waitFor({ timeout: 10000 });
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
    const indexQualityVisible =
      (await page.locator(".indexQualityPanel").getByText("색인 품질 리포트", { exact: true }).isVisible()) &&
      (await page.locator(".indexQualityPanel").getByText("게이트 통과율", { exact: true }).isVisible()) &&
      (await page.locator(".qualityGateList").getByText("청크 커버리지", { exact: true }).isVisible()) &&
      (await page.locator(".qualityDocumentList").getByText("public/status-page-policy.md", { exact: false }).first().isVisible());
    const versionHistoryVisible = await page.locator(".versionPanel").getByText("버전 이력", { exact: true }).isVisible();
    const versionDiffVisible = await page.locator(".versionPanel").getByText("line_set_diff_v1", { exact: true }).isVisible();
    const indexExplainVisible =
      (await page.locator(".indexExplainPanel").getByText("색인 준비", { exact: true }).isVisible()) &&
      (await page.locator(".indexExplainPanel").getByText("heading_paragraph_window_v1", { exact: true }).first().isVisible()) &&
      (await page.locator(".indexExplainPanel").getByText("임베딩 커버리지", { exact: true }).isVisible()) &&
      (await page.locator(".indexExplainPanel").getByText("헤딩 아웃라인", { exact: true }).isVisible());
    const documentImpactVisible =
      (await page.locator(".impactPanel").getByText("영향 분석", { exact: true }).isVisible()) &&
      (await page.locator(".impactPanel").getByText("재검증 필요", { exact: true }).isVisible()) &&
      (await page.locator(".impactAnswerList").getByText("고객 공지 SLA와 15분 공지 기준", { exact: false }).first().isVisible());
    const permissionMatrixVisible = await page.locator(".permissionMatrixPanel").getByText("문서 접근 시뮬레이터", { exact: true }).isVisible();
    const permissionMatrixDenyVisible = await page.locator(".matrixTable").getByText("차단", { exact: true }).first().isVisible();

    await page.locator(".railNav").getByRole("button", { name: /^검색 / }).click();
    await page.getByLabel("검색 질문").fill("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
    await page.getByLabel("역할").fill("support_agent");
    await page.getByRole("button", { name: "검색 미리보기" }).click();
    await page.locator(".candidateHead p").getByText("public/status-page-policy.md", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("벡터", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".scoreBars").getByText("키워드", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".rankingExplanation").getByText("랭킹 설명", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".rankingExplanation").getByText("매칭 검색어", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".rankingExplanation").getByText("권한 통과", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".retrievalDiagnostics").getByText("검색 품질 진단", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticStats").getByText("신뢰도 추정", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticBanner").getByText("컨텍스트 예산", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".queryPlanPanel").getByText("검색 실행 계획", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".queryPlanStages").getByText("3. 권한 경계", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".queryPlanStages").getByText("5. 컨텍스트 패키징", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".diagnosticChecks").getByText("권한 경계", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".contextChunkList").getByText("토큰", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "실제 답변까지 검증" }).click();
    await page.locator(".retrievalVerificationPanel").getByText("미리보기-답변 검증", { exact: true }).waitFor({
      timeout: 10000
    });
    await page.locator(".retrievalVerificationPanel").getByText("출처 겹침", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".retrievalVerificationPanel").getByText("문서 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".retrievalVerificationPanel").getByText("search_documents", { exact: false }).waitFor({ timeout: 10000 });
    const retrievalVerificationVisible =
      (await page.locator(".retrievalVerificationPanel").getByText("미리보기-답변 검증", { exact: true }).isVisible()) &&
      (await page.locator(".retrievalVerificationPanel").getByText("출처 겹침", { exact: true }).isVisible()) &&
      (await page.locator(".retrievalVerificationPanel").getByText("문서 일치율", { exact: true }).isVisible()) &&
      (await page.locator(".retrievalVerificationPanel").getByText("search_documents", { exact: false }).isVisible());
    await page.getByRole("button", { name: "질문 변형 안정성 진단" }).click();
    await page.locator(".retrievalRobustnessPanel").getByText("검색 강건성 리포트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".retrievalRobustnessPanel").getByText("1순위 안정성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".retrievalRobustnessPanel").getByText("출처 겹침", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".robustnessRuns").getByText("기준 질문", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".retrievalVerificationPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: retrievalScreenshotPath, fullPage: false });

    await page.getByLabel("검색 질문").fill("운영 DB에서 고객 정보를 바로 수정해도 돼?");
    await page.getByRole("button", { name: "검색 미리보기" }).click();
    await page.locator(".retrievalPanel").getByText("차단", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".opsBreakdown").getByText("제한", { exact: false }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "권한별 검색 비교" }).click();
    await page.locator(".permissionDiffPanel").getByText("격리 정상", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".permissionDiffPanel").getByText("제한 문서 격리", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".permissionDiffPanel").getByText("운영 관리자", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".permissionDiffPanel").getByText("restricted/production-db-policy.md", { exact: true }).waitFor({
      timeout: 10000
    });
    const retrievalPreviewVisible = await page.locator(".candidateList").getByText("종합", { exact: true }).first().isVisible();
    const retrievalScoreVisible = await page.locator(".scoreBars").getByText("키워드", { exact: true }).first().isVisible();
    const rankingExplanationVisible =
      (await page.locator(".rankingExplanation").getByText("랭킹 설명", { exact: true }).first().isVisible()) &&
      (await page.locator(".rankingExplanation").getByText("권한 통과", { exact: true }).first().isVisible());
    const retrievalBoundaryVisible = await page.locator(".opsBreakdown").getByText("제한", { exact: false }).isVisible();
    const retrievalDiagnosticsVisible =
      (await page.locator(".retrievalDiagnostics").getByText("검색 품질 진단", { exact: true }).isVisible()) &&
      (await page.locator(".queryPlanPanel").getByText("검색 실행 계획", { exact: true }).isVisible()) &&
      (await page.locator(".queryPlanStages").getByText("5. 컨텍스트 패키징", { exact: true }).isVisible()) &&
      (await page.locator(".diagnosticChecks").getByText("권한 경계", { exact: true }).isVisible()) &&
      (await page.locator(".contextChunkList").getByText("토큰", { exact: false }).first().isVisible());
    const retrievalRobustnessVisible =
      (await page.locator(".retrievalRobustnessPanel").getByText("검색 강건성 리포트", { exact: true }).isVisible()) &&
      (await page.locator(".retrievalRobustnessPanel").getByText("1순위 안정성", { exact: true }).isVisible()) &&
      (await page.locator(".robustnessRuns").getByText("기준 질문", { exact: true }).isVisible());
    const retrievalPermissionDiffVisible =
      (await page.locator(".permissionDiffPanel").getByText("격리 정상", { exact: true }).isVisible()) &&
      (await page.locator(".permissionDiffPanel").getByText("제한 문서 격리", { exact: true }).isVisible()) &&
      (await page.locator(".permissionDiffPanel").getByText("restricted/production-db-policy.md", { exact: true }).isVisible());

    await page.locator(".railNav").getByRole("button", { name: /^대응 / }).click();
    await page.getByRole("heading", { name: "장애 대응 플랜" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "장애 대응 플랜 생성" }).click();
    await page.locator(".incidentPlanPanel").getByText("런북 기반 장애 대응", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".incidentSummary").getByText("SEV1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".incidentPlanGrid").getByText("상황 파악", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".incidentPlanGrid").getByText("완화 조치", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".incidentGate").getByText("사람 승인 필요", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".incidentComms").getByText("#payments-oncall", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".incidentVerify").getByText("settlement.dlq.count", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".incidentAudit").getByText("create_incident_response_plan", { exact: false }).waitFor({ timeout: 10000 });
    await page.locator(".questionAuditBundle").getByText("질문 단위 실행 증거", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".questionAuditBundle").getByText("create_incident_response_plan", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".questionAuditBundle").getByText("정책", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".questionAuditBundle").scrollIntoViewIfNeeded();
    await page.screenshot({ path: incidentPlanScreenshotPath, fullPage: false });
    const incidentPlanVisible =
      (await page.locator(".incidentSummary").getByText("SEV1", { exact: true }).isVisible()) &&
      (await page.locator(".incidentPlanGrid").getByText("완화 조치", { exact: true }).isVisible()) &&
      (await page.locator(".incidentGate").getByText("사람 승인 필요", { exact: true }).first().isVisible()) &&
      (await page.locator(".incidentComms").getByText("#payments-oncall", { exact: true }).isVisible()) &&
      (await page.locator(".incidentAudit").getByText("create_incident_response_plan", { exact: false }).isVisible()) &&
      (await page.locator(".questionAuditBundle").getByText("create_incident_response_plan", { exact: false }).first().isVisible()) &&
      (await page.locator(".questionAuditBundle").getByText("출처 계보", { exact: true }).isVisible());

    await page.locator(".railNav").getByRole("button", { name: /^질문 / }).click();
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
    await page.locator(".reviewReasons").getByText("민감 작업", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("추적", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".qualityGatePanel").getByText("답변 신뢰 게이트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".qualityGatePanel").getByText(/공유 가능|검토 후 공유|차단 후 재작성/u).first().waitFor({ timeout: 10000 });
    await page.locator(".qualityGatePanel").getByText("승인 경계", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".qualityGatePanel").getByText("대기 중", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".traceSummary").getByText("승인", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".tracePanel").getByText("커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("근거 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").getByText("source_token_overlap_v1", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".evidenceSnippetList").getByText("매칭", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".groundingPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: groundingScreenshotPath, fullPage: false });
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
    const reviewReasonVisible = await page.locator(".reviewReasons").getByText("민감 작업", { exact: true }).isVisible();
    const traceVisible = await page.locator(".tracePanel").getByText("추적 새로고침", { exact: true }).isVisible();
    const answerQualityGateVisible =
      (await page.locator(".qualityGatePanel").getByText("답변 신뢰 게이트", { exact: true }).isVisible()) &&
      (await page.locator(".qualityGatePanel").getByText(/공유 가능|검토 후 공유|차단 후 재작성/u).first().isVisible()) &&
      (await page.locator(".qualityGatePanel").getByText("승인 경계", { exact: true }).isVisible()) &&
      (await page.locator(".qualityGatePanel").getByText("대기 중", { exact: true }).isVisible());
    const traceTimelineVisible = await page.locator(".traceTimeline").getByText("답변 생성", { exact: true }).isVisible();
    const groundingVisible = await page.locator(".groundingPanel").getByText("근거 커버리지", { exact: true }).isVisible();
    const evidenceSnippetVisible = await page.locator(".evidenceSnippetList").getByText("매칭", { exact: false }).first().isVisible();
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

    await page.locator(".railNav").getByRole("button", { name: /^승인 / }).click();
    await page.locator(".approvalList").getByText("sensitive_operation", { exact: false }).first().waitFor({ timeout: 10000 });
    const approvalText = await page.locator(".approvalList").innerText();
    await page.locator(".approvalList").getByRole("button", { name: "반려" }).first().click();

    await page.locator(".railNav").getByRole("button", { name: /^감사 / }).click();
    await page.getByRole("button", { name: "레지스트리 불러오기" }).click();
    await page.locator(".toolRegistry").getByText("search_documents", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("request_human_approval", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("create_incident_response_plan", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".toolRegistry").getByText("사람 승인 필요", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "원장 검증" }).click();
    await page.locator(".auditLedgerPanel").getByText("감사 원장 해시 체인", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".auditLedgerPanel").getByText("루트 해시", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".auditLedgerEvents").getByText("도구 호출", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".auditLedgerEvents").getByText("답변", { exact: true }).first().waitFor({ timeout: 10000 });
    await page.locator(".auditLedgerPanel").screenshot({ path: auditLedgerScreenshotPath });
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
    const toolRegistryIncidentVisible = await page.locator(".toolRegistry").getByText("create_incident_response_plan", { exact: true }).isVisible();
    const auditLedgerVisible =
      (await page.locator(".auditLedgerPanel").getByText("감사 원장 해시 체인", { exact: true }).isVisible()) &&
      (await page.locator(".auditLedgerPanel").getByText("루트 해시", { exact: true }).isVisible()) &&
      (await page.locator(".auditLedgerEvents").getByText("도구 호출", { exact: true }).first().isVisible()) &&
      (await page.locator(".auditLedgerEvents").getByText("답변", { exact: true }).first().isVisible());
    const slackProofVisible = await page.locator(".slackProof").getByText("로컬 시뮬레이션", { exact: true }).isVisible();
    const slackTraceVisible =
      (await page.locator(".slackProof").getByText("COPSDEMO", { exact: true }).isVisible()) &&
      (await page.locator(".slackProof").getByText("search_documents", { exact: false }).isVisible());
    const auditVisible = await page.locator(".auditList").getByText("search_documents", { exact: false }).first().isVisible();

    await page.locator(".railNav").getByRole("button", { name: /^품질 / }).click();
    await page.getByRole("button", { name: "운영 지표 불러오기" }).click();
    await page.locator(".portfolioReadinessPanel").getByText("포트폴리오 증거 보드", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".portfolioReadinessPanel").getByText("RAG 근거성과 문서 일치", { exact: true }).waitFor({
      timeout: 10000
    });
    await page.locator(".portfolioReadinessPanel").getByText("권한 경계와 사람 승인", { exact: true }).waitFor({
      timeout: 10000
    });
    await page.locator(".portfolioReadinessPanel").getByText("도구 호출과 감사 재현성", { exact: true }).waitFor({
      timeout: 10000
    });
    await page.locator(".portfolioReadinessPanel").getByText("5분 데모 경로", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("릴리즈 게이트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("의존성 준비", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("최신 평가 게이트", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("평가 최신성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".releaseGatePanel").getByText("SLO 가드레일", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".actionPlanPanel").getByText("운영 액션 플랜", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".actionPlanPanel").getByText("액션", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".actionPlanVerify").getByText("pnpm", { exact: false }).first().waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("사람 검토율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".observabilityPanel").getByText("평균 일치율", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("SLO 가드레일", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("답변 근거성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("도구 감사 커버리지", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".sloPanel").getByText("API 성공률", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".apiRequestPanel").getByText("API 요청 관측성", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".apiRequestStats").getByText("성공률", { exact: true }).waitFor({ timeout: 10000 });
    await page.locator(".endpointList .endpointItem").first().waitFor({ timeout: 10000 });
    await page.locator(".recentRequestList").getByText("GET", { exact: false }).first().waitFor({ timeout: 10000 });
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
    await page.locator(".portfolioReadinessPanel").scrollIntoViewIfNeeded();
    await page.locator(".portfolioReadinessPanel").screenshot({ path: portfolioReadinessScreenshotPath });
    const observabilityText = await page.locator(".observabilityPanel").innerText();
    const normalizedObservabilityText = observabilityText.toLowerCase();
    const portfolioReadinessVisible =
      observabilityText.includes("포트폴리오 증거 보드") &&
      observabilityText.includes("RAG 근거성과 문서 일치") &&
      observabilityText.includes("권한 경계와 사람 승인") &&
      observabilityText.includes("도구 호출과 감사 재현성") &&
      observabilityText.includes("운영성, SLO, API 안정성") &&
      observabilityText.includes("5분 데모 경로") &&
      observabilityText.includes("pnpm portfolio:demo");
    const observabilityVisible =
      portfolioReadinessVisible &&
      observabilityText.includes("릴리즈 게이트") &&
      observabilityText.includes("의존성 준비") &&
      observabilityText.includes("최신 평가 게이트") &&
      observabilityText.includes("평가 최신성") &&
      observabilityText.includes("운영 액션 플랜") &&
      observabilityText.includes("사람 검토율") &&
      observabilityText.includes("평균 일치율") &&
      observabilityText.includes("SLO 가드레일") &&
      observabilityText.includes("답변 근거성") &&
      observabilityText.includes("도구 감사 커버리지") &&
      observabilityText.includes("API 성공률") &&
      observabilityText.includes("API 요청 관측성") &&
      observabilityText.includes("request_human_approval") &&
      observabilityText.includes("피드백");

    await page.locator(".railNav").getByRole("button", { name: /^질문 / }).click();
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
        indexQualityVisible &&
        versionHistoryVisible &&
        versionDiffVisible &&
        indexExplainVisible &&
        documentImpactVisible &&
        permissionMatrixVisible &&
        permissionMatrixDenyVisible &&
        retrievalPreviewVisible &&
        retrievalScoreVisible &&
        rankingExplanationVisible &&
        retrievalBoundaryVisible &&
        retrievalDiagnosticsVisible &&
        retrievalVerificationVisible &&
        retrievalRobustnessVisible &&
        retrievalPermissionDiffVisible &&
        incidentPlanVisible &&
        evaluationVisible &&
        documentMatchVisible &&
        citationVisible &&
        qualityGatePassed &&
        evalHistoryVisible &&
        evalHistoryDeltaVisible &&
        evalCaseDetailVisible &&
        evalCaseExplorerVisible &&
        evalSourceCompareVisible &&
        boundaryAuditVisible &&
        reviewReasonVisible &&
        traceVisible &&
        answerQualityGateVisible &&
        traceTimelineVisible &&
        groundingVisible &&
        evidenceSnippetVisible &&
        contextPackageVisible &&
        proofPacketVisible &&
        replayDriftVisible &&
        evidenceBundleVisible &&
        toolRegistryVisible &&
        toolRegistryApprovalVisible &&
        toolRegistryIncidentVisible &&
        auditLedgerVisible &&
        slackProofVisible &&
        slackTraceVisible &&
        auditVisible &&
        portfolioReadinessVisible &&
        observabilityVisible &&
        usageVisible &&
        usagePageVisible,
      baseUrl,
      screenshotPath,
      retrievalScreenshotPath,
      groundingScreenshotPath,
      indexQualityScreenshotPath,
      documentImpactScreenshotPath,
      incidentPlanScreenshotPath,
      portfolioReadinessScreenshotPath,
      auditLedgerScreenshotPath,
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
        indexQualityVisible,
        versionHistoryVisible,
        versionDiffVisible,
        indexExplainVisible,
        documentImpactVisible,
        permissionMatrixVisible,
        permissionMatrixDenyVisible,
        retrievalPreviewVisible,
        retrievalScoreVisible,
        rankingExplanationVisible,
        retrievalBoundaryVisible,
        retrievalDiagnosticsVisible,
        retrievalVerificationVisible,
        retrievalRobustnessVisible,
        retrievalPermissionDiffVisible,
        incidentPlanVisible,
        evaluationVisible,
        documentMatchVisible,
        citationVisible,
        qualityGatePassed,
        evalHistoryVisible,
        evalHistoryDeltaVisible,
        evalCaseDetailVisible,
        evalCaseExplorerVisible,
        evalSourceCompareVisible,
        boundaryAuditVisible,
        reviewReasonVisible,
        traceVisible,
        answerQualityGateVisible,
        traceTimelineVisible,
        groundingVisible,
        evidenceSnippetVisible,
        contextPackageVisible,
        proofPacketVisible,
        replayDriftVisible,
        evidenceBundleVisible,
        toolRegistryVisible,
        toolRegistryApprovalVisible,
        toolRegistryIncidentVisible,
        auditLedgerVisible,
        slackProofVisible,
        slackTraceVisible,
        auditVisible,
        portfolioReadinessVisible,
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
