export type DocumentAgreement = {
  score: number;
  matchedTokenCount: number;
  answerTokenCount: number;
  sourceChunkCount: number;
  method: "token_overlap_v1";
};

const AGREEMENT_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "must",
  "when",
  "what",
  "how",
  "are",
  "should",
  "해야",
  "어떻게",
  "무엇",
  "필요",
  "확인",
  "합니다",
  "하세요",
  "있습니다",
  "필요합니다",
  "담당자",
  "agent"
]);

export function calculateDocumentAgreement(answer: string, sourceContents: string[]): DocumentAgreement {
  const answerTokens = new Set(tokenizeForAgreement(removeAgreementBoilerplate(answer)));
  const sourceTokens = new Set(sourceContents.flatMap((content) => tokenizeForAgreement(content)));
  const matchedTokenCount = [...answerTokens].filter((token) => sourceTokens.has(token)).length;
  const score =
    answerTokens.size === 0
      ? sourceContents.length === 0
        ? 1
        : 0
      : Number((matchedTokenCount / answerTokens.size).toFixed(3));

  return {
    score,
    matchedTokenCount,
    answerTokenCount: answerTokens.size,
    sourceChunkCount: sourceContents.length,
    method: "token_overlap_v1"
  };
}

export function removeAgreementBoilerplate(answer: string): string {
  return answer
    .split(/\n+/)
    .filter((line) => !/^\s*근거\s*:/u.test(line))
    .filter((line) => !/신뢰도가 낮거나 민감 작업이 포함되어 담당자 확인이 필요합니다/u.test(line))
    .filter((line) => !/운영 DB 변경, 권한 부여, 삭제 같은 민감 작업은 Agent가 직접 실행하지 않고 승인 요청으로 분리합니다/u.test(line))
    .join(" ");
}

export function tokenizeForAgreement(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .map((token) => stripParticle(token.trim()))
    .filter((token) => token.length >= 2)
    .filter((token) => !AGREEMENT_STOPWORDS.has(token));
}

function stripParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}
