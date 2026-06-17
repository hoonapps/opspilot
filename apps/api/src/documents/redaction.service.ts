import { Injectable } from "@nestjs/common";

export type RedactionResult = {
  content: string;
  redactionCount: number;
  patterns: string[];
  promptInjection: PromptInjectionScan;
};

export type PromptInjectionScan = {
  risk: boolean;
  patternCount: number;
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
      patterns: [...patterns].sort(),
      promptInjection: scanPromptInjection(redacted)
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

const PROMPT_INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "ignore_previous_instructions", regex: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+instructions\b/i },
  { name: "system_prompt_exfiltration", regex: /\b(system|developer)\s+prompt\b.*\b(show|print|reveal|exfiltrate|leak)\b/i },
  { name: "instruction_hierarchy_override", regex: /\b(act as|you are now|new instructions?|highest priority)\b/i },
  { name: "korean_ignore_instructions", regex: /(이전|위의|기존)\s*(지시|명령|프롬프트)\s*(무시|잊어|삭제)/u },
  { name: "korean_prompt_exfiltration", regex: /(시스템|개발자)\s*(프롬프트|지시)\s*(출력|공개|노출|유출)/u }
];

function scanPromptInjection(content: string): PromptInjectionScan {
  const patterns = PROMPT_INJECTION_PATTERNS.filter((pattern) => pattern.regex.test(content)).map((pattern) => pattern.name);

  return {
    risk: patterns.length > 0,
    patternCount: patterns.length,
    patterns: [...new Set(patterns)].sort()
  };
}
