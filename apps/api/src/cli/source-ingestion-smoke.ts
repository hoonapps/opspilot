import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { deflateRawSync } from "node:zlib";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { DocumentsService } from "../documents/documents.service";

const ACTOR = { roles: ["support_agent"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const server = createFixtureServer();

  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    await listen(server);
    const address = server.address() as AddressInfo;
    const fixtureUrl = `http://127.0.0.1:${address.port}/ops-url-fixture`;

    await documents.resetDocuments(false);
    const privateUrlBlocked = await expectPrivateUrlBlocked(documents, fixtureUrl);
    const text = await documents.ingestSource({
      sourceType: "text",
      path: "public/uploads/source-text-smoke.md",
      title: "텍스트 수집 Smoke 문서",
      content:
        "OPSTXT-77 텍스트 문서는 사용자가 txt 내용을 붙여넣으면 OpsPilot이 저장, 청킹, 임베딩, 검색 답변까지 연결해야 함을 증명합니다. " +
        "검증 기준은 텍스트 추출 길이, 검색 가능한 청크 생성, 검색 힌트 확보, 보안 스캔 통과이며 좋은 문서는 수집 품질 ready 상태가 되어야 합니다."
    });
    const previousPrivateUrlSetting = process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS;
    process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS = "true";
    let url!: Awaited<ReturnType<DocumentsService["ingestSource"]>>;
    try {
      url = await documents.ingestSource({
        sourceType: "url",
        path: "public/uploads/source-url-smoke.md",
        url: fixtureUrl,
        title: "URL 수집 Smoke 문서"
      });
    } finally {
      if (previousPrivateUrlSetting === undefined) {
        delete process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS;
      } else {
        process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS = previousPrivateUrlSetting;
      }
    }
    const pdf = await documents.ingestSource({
      sourceType: "pdf",
      path: "public/uploads/source-pdf-smoke.md",
      title: "PDF 수집 Smoke 문서",
      fileName: "source-pdf-smoke.pdf",
      base64: createPdfFixture(
        "OPSPDF-99 PDF document proves OpsPilot can extract uploaded PDF text, store chunks, create embeddings, and answer with the PDF as evidence. " +
          "The validation standard is that the PDF document becomes the top RAG source."
      ).toString("base64")
    });
    const docx = await documents.ingestSource({
      sourceType: "docx",
      path: "public/uploads/source-docx-smoke.md",
      title: "Word 수집 Smoke 문서",
      fileName: "source-docx-smoke.docx",
      base64: createDocxFixture(
        "OPSDOCX-66 Word document proves OpsPilot can extract uploaded DOCX text, store chunks, create embeddings, and answer with the Word document as evidence. " +
          "The validation standard is that the DOCX document becomes the top RAG source."
      ).toString("base64")
    });
    const weak = await documents.ingestSource({
      sourceType: "text",
      path: "public/uploads/source-weak-smoke.md",
      title: "짧은 수집 Smoke 문서",
      content: "짧은 문서입니다. OPSWEAK-11"
    });
    const textAnswer = await agent.ask("OPSTXT-77 텍스트 문서는 무엇을 증명해?", ACTOR, "source-ingestion-smoke");
    const urlAnswer = await agent.ask("OPSURL-88 URL 문서의 검증 기준은 뭐야?", ACTOR, "source-ingestion-smoke");
    const pdfAnswer = await agent.ask("OPSPDF-99 PDF 문서는 무엇을 증명해?", ACTOR, "source-ingestion-smoke");
    const docxAnswer = await agent.ask("OPSDOCX-66 Word 문서는 무엇을 증명해?", ACTOR, "source-ingestion-smoke");
    const previousUnsupportedThreshold = process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD;
    process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD = "0.95";
    const unsupportedAnswer = await agent.ask("화성 토양 배터리 교체 절차는 뭐야?", ACTOR, "source-ingestion-smoke");
    if (previousUnsupportedThreshold === undefined) {
      delete process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD;
    } else {
      process.env.UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD = previousUnsupportedThreshold;
    }
    const reset = await documents.resetDocuments(true);
    const inventory = await documents.listInventory();

    const ok =
      text.parser === "plain_text_v1" &&
      text.chunks > 0 &&
      text.quality.schemaVersion === "opspilot.source_ingestion_quality.v1" &&
      text.quality.status === "ready" &&
      text.quality.checks.some((check) => check.id === "retrieval_hints" && check.status === "pass") &&
      text.quality.suggestedQuestions.length >= 3 &&
      text.quality.suggestedQuestions.some(
        (suggestion) => suggestion.question.includes("텍스트 수집 Smoke 문서") && suggestion.expectedEvidence.includes("텍스트 수집 Smoke 문서")
      ) &&
      privateUrlBlocked &&
      url.parser === "html_text_v1" &&
      url.chunks > 0 &&
      url.quality.status === "ready" &&
      url.quality.suggestedQuestions.some((suggestion) => suggestion.question.includes("URL 수집 Smoke 문서")) &&
      pdf.parser === "pdf_text_v1" &&
      pdf.chunks > 0 &&
      pdf.extractedCharacters > 80 &&
      pdf.quality.status === "ready" &&
      pdf.quality.suggestedQuestions.some((suggestion) => suggestion.question.includes("PDF 수집 Smoke 문서")) &&
      docx.parser === "docx_text_v1" &&
      docx.chunks > 0 &&
      docx.extractedCharacters > 80 &&
      docx.quality.status === "ready" &&
      docx.quality.suggestedQuestions.some((suggestion) => suggestion.question.includes("Word 수집 Smoke 문서")) &&
      weak.quality.status === "attention" &&
      weak.quality.checks.some((check) => check.id === "text_extraction" && check.status === "fail") &&
      weak.quality.suggestedQuestions.length >= 3 &&
      textAnswer.sources[0]?.path === "public/uploads/source-text-smoke.md" &&
      urlAnswer.sources[0]?.path === "public/uploads/source-url-smoke.md" &&
      pdfAnswer.sources[0]?.path === "public/uploads/source-pdf-smoke.md" &&
      docxAnswer.sources[0]?.path === "public/uploads/source-docx-smoke.md" &&
      unsupportedAnswer.answer.includes("문서에서 확인할 수 없습니다") &&
      unsupportedAnswer.needsHumanReview &&
      reset.deleted.documents >= 5 &&
      reset.reloadedSeed &&
      inventory.documents.some((document) => document.path === "public/payment-error-codes.md");

    console.log(
      JSON.stringify(
        {
          ok,
          ingested: { text, url, pdf, docx, weak },
          answers: {
            textTopSource: textAnswer.sources[0]?.path,
            urlTopSource: urlAnswer.sources[0]?.path,
            pdfTopSource: pdfAnswer.sources[0]?.path,
            docxTopSource: docxAnswer.sources[0]?.path,
            unsupported: unsupportedAnswer.answer,
            unsupportedReview: unsupportedAnswer.needsHumanReview
          },
          privateUrlBlocked,
          reset: {
            deleted: reset.deleted,
            reloadedSeed: reset.reloadedSeed,
            restoredDocuments: inventory.documents.length
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Source ingestion smoke test failed");
    }
  } finally {
    server.close();
    await app.close();
  }
}

function createFixtureServer() {
  return createServer((request, response) => {
    if (request.url !== "/ops-url-fixture") {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>URL 수집 Smoke 문서</title></head>
        <body>
          <h1>URL 수집 Smoke 문서</h1>
          <p>OPSURL-88 URL 문서는 사용자가 URL을 입력했을 때 HTML 본문을 텍스트로 추출하고 기존 RAG 색인에 연결해야 함을 증명합니다.</p>
          <p>검증 기준은 URL 문서가 1순위 출처로 검색되고 답변 근거에 포함되는 것입니다.</p>
        </body>
      </html>`);
  });
}

function listen(server: ReturnType<typeof createFixtureServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function expectPrivateUrlBlocked(documents: DocumentsService, fixtureUrl: string): Promise<boolean> {
  const previousPrivateUrlSetting = process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS;
  delete process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS;
  try {
    await documents.ingestSource({
      sourceType: "url",
      path: "public/uploads/source-private-url-blocked.md",
      url: fixtureUrl,
      title: "차단되어야 하는 private URL"
    });
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("private");
  } finally {
    if (previousPrivateUrlSetting === undefined) {
      delete process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS;
    } else {
      process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS = previousPrivateUrlSetting;
    }
  }
}

function createPdfFixture(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ""
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  objects[4] = `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "binary");
}

function createDocxFixture(text: string): Buffer {
  return createZipArchive([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    ],
    [
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body></w:document>`
    ]
  ]);
}

function createZipArchive(files: Array<[string, string]>): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.concat([
      Buffer.from("504b0304", "hex"),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer,
      compressed
    ]);
    const central = Buffer.concat([
      Buffer.from("504b0102", "hex"),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer
    ]);

    localRecords.push(local);
    centralRecords.push(central);
    offset += local.length;
  }

  const centralStart = offset;
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.concat([
    Buffer.from("504b0506", "hex"),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(centralStart),
    uint16(0)
  ]);

  return Buffer.concat([...localRecords, centralDirectory, end]);
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
