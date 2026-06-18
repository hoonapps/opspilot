import { Injectable } from "@nestjs/common";
import { ChatProvider, createChatProviderFromEnv } from "@opspilot/ai";
import { RunbookChecklist } from "./runbook-checklist.service";
import { SearchResult } from "./search.service";

@Injectable()
export class AnswerGeneratorService {
  async generate(input: {
    question: string;
    sources: SearchResult[];
    confidence: number;
    unsupportedConfidenceThreshold: number;
    needsHumanReview: boolean;
    sensitiveAction: boolean;
    checklist?: RunbookChecklist | null;
  }): Promise<string> {
    const chatProvider = createChatProviderFromEnv();
    if (chatProvider) {
      return this.generateWithProvider(input, chatProvider);
    }

    return this.generateLocal(input);
  }

  private async generateWithProvider(input: {
    question: string;
    sources: SearchResult[];
    confidence: number;
    unsupportedConfidenceThreshold: number;
    needsHumanReview: boolean;
    sensitiveAction: boolean;
    checklist?: RunbookChecklist | null;
  }, chatProvider: ChatProvider): Promise<string> {
    if (shouldRefuseUnsupportedAnswer(input)) {
      return this.generateLocal(input);
    }
    const context = input.sources
      .slice(0, 4)
      .map((source, index) => {
        return `[${index + 1}] ${source.title} (${source.path})\n${source.content}`;
      })
      .join("\n\n");

    const answer = await chatProvider.complete({
      temperature: 0.1,
      system:
        "당신은 운영 지원 에이전트 OpsPilot입니다. 반드시 제공된 출처만 근거로 한국어로 답변하세요. 출처에 없는 내용은 추론하거나 보완하지 말고 '문서에서 확인할 수 없습니다'라고 말하세요. 구조화된 런북 체크리스트가 있으면 번호 목록을 유지하세요. 출처가 부족하거나 신뢰도가 낮으면 담당자 확인이 필요하다고 말하세요. 마지막에는 출처 제목을 포함한 짧은 근거 줄을 반드시 포함하세요.",
      user: `질문: ${input.question}\n\n출처:\n${context}\n\n런북 체크리스트:\n${formatChecklist(input.checklist)}\n\n민감 작업 여부: ${input.sensitiveAction}\n사람 검토 필요 여부: ${input.needsHumanReview}`
    });

    return answer || this.generateLocal(input);
  }

  private generateLocal(input: {
    question: string;
    sources: SearchResult[];
    confidence: number;
    unsupportedConfidenceThreshold: number;
    needsHumanReview: boolean;
    sensitiveAction: boolean;
    checklist?: RunbookChecklist | null;
  }): string {
    if (input.sources.length === 0) {
      return "문서에서 확인할 수 없습니다. 현재 접근 가능한 문서 안에서 관련 근거를 찾지 못했습니다. 담당자 확인이 필요합니다.";
    }

    if (input.confidence < input.unsupportedConfidenceThreshold) {
      return `문서에서 확인할 수 없습니다. 검색 신뢰도 ${input.confidence.toFixed(3)}가 최소 근거 기준 ${input.unsupportedConfidenceThreshold.toFixed(3)}보다 낮아 답변을 생성하지 않습니다.\n\n담당자 확인이 필요합니다.`;
    }

    const top = input.sources[0];
    const evidence = input.checklist
      ? formatChecklist(input.checklist)
      : extractRelevantLines(input.question, top.content).join("\n");
    const reviewLine = input.needsHumanReview
      ? "\n\n신뢰도가 낮거나 민감 작업이 포함되어 담당자 확인이 필요합니다."
      : "";
    const approvalLine = input.sensitiveAction
      ? "\n\n운영 DB 변경, 권한 부여, 삭제 같은 민감 작업은 Agent가 직접 실행하지 않고 승인 요청으로 분리합니다."
      : "";

    return `${evidence || summarizeForAnswer(top.content)}${input.checklist ? "" : `\n\n근거: ${top.title} (${top.path})`}${reviewLine}${approvalLine}`;
  }
}

function shouldRefuseUnsupportedAnswer(input: {
  sources: SearchResult[];
  confidence: number;
  unsupportedConfidenceThreshold: number;
}): boolean {
  return input.sources.length === 0 || input.confidence < input.unsupportedConfidenceThreshold;
}

function formatChecklist(checklist?: RunbookChecklist | null): string {
  if (!checklist) {
    return "";
  }

  return `${checklist.items.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n근거: ${checklist.title} (${checklist.path})`;
}

function extractRelevantLines(question: string, content: string): string[] {
  const questionTokens = new Set(
    question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  );

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSearchAliasLine(line))
    .filter((line) => {
      const lower = line.toLowerCase();
      return [...questionTokens].some((token) => lower.includes(token));
    })
    .slice(0, 5);
}

function summarizeForAnswer(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSearchAliasLine(line))
    .filter((line) => !/^#{1,6}\s/.test(line))
    .slice(0, 6)
    .join("\n");
}

function isSearchAliasLine(line: string): boolean {
  return /^korean aliases:/i.test(line);
}
