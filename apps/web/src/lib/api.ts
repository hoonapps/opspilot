export type AskResponse = {
  questionId: string;
  answerId: string;
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

export type Approval = {
  id: string;
  questionId?: string | null;
  question?: string | null;
  action: string;
  reason: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type FeedbackResponse = {
  id: string;
  answerId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
};

export type IngestResponse = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

export type GithubSyncResponse = {
  source: string;
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  documents: IngestResponse[];
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
      "x-user-roles": input.roles,
      "x-roles": input.roles
    },
    body: JSON.stringify({ question: input.question, channel: "web" })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AskResponse>;
}

export async function listApprovals(): Promise<Approval[]> {
  const response = await fetch(`${API_BASE_URL}/approvals?status=pending`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { approvals: Approval[] };
  return data.approvals;
}

export async function updateApproval(input: { id: string; status: "approved" | "rejected"; reviewerNote?: string }): Promise<Approval> {
  const response = await fetch(`${API_BASE_URL}/approvals/${input.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: input.status, reviewerNote: input.reviewerNote })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<Approval>;
}

export async function createFeedback(input: { answerId: string; rating: number; comment?: string }): Promise<FeedbackResponse> {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<FeedbackResponse>;
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

export async function syncGithubDocuments(input: {
  owner: string;
  repo: string;
  branch?: string;
  rootPath?: string;
  sourcePrefix?: string;
}): Promise<GithubSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/documents/github/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<GithubSyncResponse>;
}
