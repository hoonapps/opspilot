import { Injectable } from "@nestjs/common";
import { SearchResult } from "./search.service";

export type RunbookChecklist = {
  title: string;
  path: string;
  items: string[];
};

@Injectable()
export class RunbookChecklistService {
  create(question: string, sources: SearchResult[]): RunbookChecklist | null {
    if (!shouldCreateChecklist(question)) {
      return null;
    }

    for (const source of sources) {
      const items = extractChecklistItems(source.content);
      if (items.length > 0 && isRunbookSource(source)) {
        return {
          title: source.title,
          path: source.path,
          items
        };
      }
    }

    return null;
  }
}

function shouldCreateChecklist(question: string): boolean {
  return /(체크리스트|runbook|런북|장애\s*대응|incident|대응\s*순서|what\s*steps|checklist)/i.test(question);
}

function isRunbookSource(source: SearchResult): boolean {
  const tags = Array.isArray(source.metadata.tags) ? source.metadata.tags.join(" ") : "";
  return /runbook|incident|체크리스트|런북/i.test(`${source.title} ${source.path} ${tags} ${source.content}`);
}

function extractChecklistItems(content: string): string[] {
  const checklistSection = content.match(/##\s+Checklist\s*\n([\s\S]*?)(?=\n##\s+|$)/i)?.[1] ?? content;

  return checklistSection
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1] ?? "")
    .filter(Boolean)
    .slice(0, 8);
}
