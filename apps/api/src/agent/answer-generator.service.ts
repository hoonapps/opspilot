import { Injectable } from "@nestjs/common";
import { ChatProvider, createChatProviderFromEnv } from "@opspilot/ai";
import { RunbookChecklist } from "./runbook-checklist.service";
import { SearchResult } from "./search.service";

@Injectable()
export class AnswerGeneratorService {
  async generate(input: {
    question: string;
    sources: SearchResult[];
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
    needsHumanReview: boolean;
    sensitiveAction: boolean;
    checklist?: RunbookChecklist | null;
  }, chatProvider: ChatProvider): Promise<string> {
    if (input.sources.length === 0) {
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
        "You are OpsPilot, an operational support agent. Answer only from the supplied sources. If a structured runbook checklist is supplied, preserve it as numbered action items. If the sources are insufficient, say 담당자 확인이 필요합니다. Always include a concise 근거 line with source titles.",
      user: `Question: ${input.question}\n\nSources:\n${context}\n\nRunbook checklist:\n${formatChecklist(input.checklist)}\n\nSensitive action: ${input.sensitiveAction}\nNeeds human review: ${input.needsHumanReview}`
    });

    return answer || this.generateLocal(input);
  }

  private generateLocal(input: {
    question: string;
    sources: SearchResult[];
    needsHumanReview: boolean;
    sensitiveAction: boolean;
    checklist?: RunbookChecklist | null;
  }): string {
    if (input.sources.length === 0) {
      return "관련 운영 문서를 찾지 못했습니다. 담당자 확인이 필요합니다.";
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
