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

    await page.getByRole("button", { name: "Upsert document" }).click();
    await page.getByText("Status Page Incident Communication indexed as", { exact: false }).waitFor({ timeout: 10000 });

    await page.getByRole("button", { name: "Ask OpsPilot" }).click();
    const answerPanel = page.locator(".answerPanel pre");
    await answerPanel.getByText("publish the first status page notice within 15 minutes", { exact: false }).waitFor({
      timeout: 10000
    });
    await page.locator(".sourceList").getByText("public/status-page-policy.md", { exact: false }).waitFor({
      timeout: 10000
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const answerText = await answerPanel.innerText();
    const sourceText = await page.locator(".sourceList").innerText();
    const metaText = await page.locator(".answerMeta").innerText();
    const report = {
      ok: answerText.includes("15 minutes") && sourceText.includes("public/status-page-policy.md") && metaText.includes("search_documents"),
      baseUrl,
      screenshotPath,
      checks: {
        answerIncludesSla: answerText.includes("15 minutes"),
        sourceIncludesNewDocument: sourceText.includes("public/status-page-policy.md"),
        toolCallVisible: metaText.includes("search_documents")
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
