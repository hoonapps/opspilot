import { Injectable } from "@nestjs/common";
import { SearchResult } from "./search.service";

@Injectable()
export class AnswerGeneratorService {
  async generate(input: {
    question: string;
    sources: SearchResult[];
    needsHumanReview: boolean;
    sensitiveAction: boolean;
  }): Promise<string> {
    if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
      return this.generateWithOpenAI(input);
    }

    return this.generateLocal(input);
  }

  private async generateWithOpenAI(input: {
    question: string;
    sources: SearchResult[];
    needsHumanReview: boolean;
    sensitiveAction: boolean;
  }): Promise<string> {
    if (input.sources.length === 0) {
      return this.generateLocal(input);
    }

    const context = input.sources
      .slice(0, 4)
      .map((source, index) => {
        return `[${index + 1}] ${source.title} (${source.path})\n${source.content}`;
      })
      .join("\n\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are OpsPilot, an operational support agent. Answer only from the supplied sources. If the sources are insufficient, say 담당자 확인이 필요합니다. Always include a concise 근거 line with source titles."
          },
          {
            role: "user",
            content: `Question: ${input.question}\n\nSources:\n${context}\n\nSensitive action: ${input.sensitiveAction}\nNeeds human review: ${input.needsHumanReview}`
          }
        ]
      })
    });

    if (!response.ok) {
      return this.generateLocal(input);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return json.choices?.[0]?.message?.content?.trim() || this.generateLocal(input);
  }

  private generateLocal(input: {
    question: string;
    sources: SearchResult[];
    needsHumanReview: boolean;
    sensitiveAction: boolean;
  }): string {
    if (input.sources.length === 0) {
      return "관련 운영 문서를 찾지 못했습니다. 담당자 확인이 필요합니다.";
    }

    const top = input.sources[0];
    const evidence = extractRelevantLines(input.question, top.content).join("\n");
    const reviewLine = input.needsHumanReview
      ? "\n\n신뢰도가 낮거나 민감 작업이 포함되어 담당자 확인이 필요합니다."
      : "";
    const approvalLine = input.sensitiveAction
      ? "\n\n운영 DB 변경, 권한 부여, 삭제 같은 민감 작업은 Agent가 직접 실행하지 않고 승인 요청으로 분리합니다."
      : "";

    return `${evidence || summarizeForAnswer(top.content)}\n\n근거: ${top.title} (${top.path})${reviewLine}${approvalLine}`;
  }
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
