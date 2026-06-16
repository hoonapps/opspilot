import { Injectable } from "@nestjs/common";

export type RedactionResult = {
  content: string;
  redactionCount: number;
  patterns: string[];
};

type RedactionPattern = {
  name: string;
  regex: RegExp;
  replace: (match: string, ...groups: string[]) => string;
};

const SECRET_PLACEHOLDER = "[REDACTED_SECRET]";

@Injectable()
export class RedactionService {
  redactMarkdown(content: string): RedactionResult {
    let redacted = content;
    let redactionCount = 0;
    const patterns = new Set<string>();

    for (const pattern of REDACTION_PATTERNS) {
      redacted = redacted.replace(pattern.regex, (match, ...groups: string[]) => {
        redactionCount += 1;
        patterns.add(pattern.name);
        return pattern.replace(match, ...groups);
      });
    }

    return {
      content: redacted,
      redactionCount,
      patterns: [...patterns].sort()
    };
  }
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    name: "aws_access_key",
    regex: /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/g,
    replace: () => SECRET_PLACEHOLDER
  },
  {
    name: "github_token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replace: () => SECRET_PLACEHOLDER
  },
  {
    name: "slack_token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replace: () => SECRET_PLACEHOLDER
  },
  {
    name: "bearer_token",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g,
    replace: () => `Bearer ${SECRET_PLACEHOLDER}`
  },
  {
    name: "key_value_secret",
    regex:
      /\b(api[_-]?key|secret|token|password|passwd|access[_-]?token|client[_-]?secret)\s*[:=]\s*([^\s'"`]+|"[^"\n]+"|'[^'\n]+')/gi,
    replace: (_match, key: string) => `${key}=${SECRET_PLACEHOLDER}`
  }
];
