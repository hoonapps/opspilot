export type AskResponse = {
  answer: string;
  confidence: number;
  needsHumanReview: boolean;
  sources: Array<{
    title: string;
    path: string;
    score: number;
  }>;
  toolCalls: Array<{
    toolName: string;
    status: string;
  }>;
};

export type IngestResponse = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function askOpsPilot(input: {
  question: string;
  teamSlugs: string;
  roles: string;
}): Promise<AskResponse> {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-roles": input.roles
    },
    body: JSON.stringify({ question: input.question, channel: "web" })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AskResponse>;
}

export async function upsertMarkdown(input: { path: string; markdown: string }): Promise<IngestResponse> {
  const response = await fetch(`${API_BASE_URL}/documents/markdown`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<IngestResponse>;
}
