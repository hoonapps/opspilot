export type AskResponse = {
  questionId: string;
  answerId: string;
  answer: string;
  confidence: number;
  documentAgreement: {
    score: number;
    matchedTokenCount: number;
    answerTokenCount: number;
    sourceChunkCount: number;
    method: "token_overlap_v1";
  };
  needsHumanReview: boolean;
  reviewReasons: Array<{
    code: "no_sources" | "low_confidence" | "sensitive_action";
    message: string;
    confidence?: number;
    threshold?: number;
    policy?: string;
  }>;
  permissionAudit: {
    enforcement: "pre_ranking_sql_filter" | "postgres_recheck_after_elasticsearch";
    candidateWindow: number;
    allowedCandidateCount: number;
    deniedCandidateCount: number;
    deniedByVisibility: Record<string, number>;
    actor: {
      roles: string[];
      teamSlugs: string[];
    };
  };
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

export type DocumentInventoryItem = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  contentHash: string;
  metadata: {
    security?: {
      redactionCount?: number;
      redactionPatterns?: string[];
    };
    tags?: string[];
    [key: string]: unknown;
  };
  chunkCount: number;
  latestVersion: number;
  updatedAt: string;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    heading?: string | null;
    contentPreview: string;
    contentLength: number;
  }>;
};

export type DocumentVersionHistory = {
  document: {
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    latestVersion: number;
  };
  versions: Array<{
    id: string;
    version: number;
    contentHash: string;
    contentLength: number;
    contentPreview: string;
    createdAt: string;
    diffFromPrevious: DocumentVersionDiff | null;
  }>;
  latestDiff: DocumentVersionDiff | null;
};

export type DocumentVersionDiff = {
  method: "line_set_diff_v1";
  fromVersion: number;
  toVersion: number;
  addedLineCount: number;
  removedLineCount: number;
  unchangedLineCount: number;
  addedPreview: string[];
  removedPreview: string[];
};

export type RetrievalPreviewResponse = {
  query: string;
  limit: number;
  permissionAudit: AskResponse["permissionAudit"];
  candidates: Array<{
    rank: number;
    chunkId: string;
    documentId: string;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    score: number;
    retrieval: {
      vectorScore?: number;
      lexicalScore?: number;
      fusedScore?: number;
      mode: "vector" | "hybrid";
    };
    heading?: string | null;
    contentPreview: string;
  }>;
};

export type PermissionBoundaryMatrix = {
  generatedAt: string;
  policy: {
    visibilityLevels: Array<{
      visibility: "public" | "team" | "restricted";
      rule: string;
    }>;
    personas: Array<{
      id: string;
      label: string;
      roles: string[];
      teamSlugs: string[];
    }>;
  };
  documents: Array<{
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    decisions: Array<{
      persona: string;
      allowed: boolean;
      reason: string;
    }>;
  }>;
  summary: Array<{
    persona: string;
    allowed: number;
    denied: number;
  }>;
};

export type EvaluationReport = {
  suiteName: string;
  createdAt: string;
  total: number;
  passed: boolean;
  thresholds: {
    sourceHitRate: number;
    topSourceAccuracy: number;
    humanReviewAccuracy: number;
    documentAgreementScore: number;
    citationAccuracy: number;
  };
  gates: Array<{
    metric: "sourceHitRate" | "topSourceAccuracy" | "humanReviewAccuracy" | "documentAgreementScore" | "citationAccuracy";
    score: number;
    threshold: number;
    passed: boolean;
  }>;
  metrics: {
    sourceHitRate: number;
    topSourceAccuracy: number;
    humanReviewAccuracy: number;
    documentAgreementScore: number;
    citationAccuracy: number;
  };
  rows: Array<{
    id: string;
    hit: boolean;
    needsHumanReview: boolean;
    expectedSources: string[];
    actualSources: string[];
    confidence: number;
    documentAgreement: number;
    citationPresent: boolean;
  }>;
};

export type ToolCallAuditItem = {
  id: string;
  questionId: string | null;
  question: string | null;
  toolName: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};

export type AnswerTrace = {
  summary: {
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    needsHumanReview: boolean;
    confidence: number;
    documentAgreementScore: number;
    durationMs: number;
    coveredAnswerTokenCount: number;
    answerTokenCount: number;
  };
  grounding: {
    method: "source_token_overlap_v1";
    answerTokenCount: number;
    coveredAnswerTokenCount: number;
    coverageRatio: number;
    sources: Array<{
      rank: number;
      path: string;
      title: string;
      coverageRatio: number;
      matchedTokenCount: number;
      answerTokenCount: number;
      matchedTokens: string[];
    }>;
  };
  timeline: Array<{
    order: number;
    kind: "question" | "retrieval" | "answer" | "tool" | "approval" | "feedback";
    title: string;
    status: string;
    at: string;
    detail: Record<string, unknown>;
  }>;
  answer: {
    id: string;
    questionId: string;
    question: string;
    channel?: string | null;
    actor: Record<string, unknown>;
    text: string;
    confidence: number;
    needsHumanReview: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  sources: Array<{
    rank: number;
    score: number;
    documentId: string;
    chunkId: string;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    chunkIndex: number;
    contentPreview: string;
  }>;
  toolCalls: Array<{
    id: string;
    toolName: string;
    status: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    createdAt: string;
  }>;
  approvals: Array<{
    id: string;
    action: string;
    reason: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
  feedback: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
  }>;
};

export type ObservabilitySummary = {
  generatedAt: string;
  questions: {
    total: number;
    last24h: number;
  };
  answers: {
    total: number;
    needsHumanReview: number;
    humanReviewRate: number;
    averageConfidence: number;
    averageDocumentAgreement: number;
  };
  toolCalls: {
    total: number;
    byName: Record<string, number>;
    byStatus: Record<string, number>;
  };
  approvals: {
    total: number;
    byStatus: Record<string, number>;
  };
  feedback: {
    total: number;
    averageRating: number;
    helpful: number;
    needsWork: number;
  };
  documents: {
    total: number;
    chunks: number;
  };
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

export async function previewRetrieval(input: {
  question: string;
  teamSlugs: string;
  roles: string;
  limit: number;
}): Promise<RetrievalPreviewResponse> {
  const response = await fetch(`${API_BASE_URL}/retrieval/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    },
    body: JSON.stringify({ question: input.question, limit: input.limit })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<RetrievalPreviewResponse>;
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

export async function listDocuments(): Promise<DocumentInventoryItem[]> {
  const response = await fetch(`${API_BASE_URL}/documents`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { documents: DocumentInventoryItem[] };
  return data.documents;
}

export async function getDocumentVersionHistory(documentId: string): Promise<DocumentVersionHistory> {
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/versions`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentVersionHistory>;
}

export async function getPermissionBoundaryMatrix(): Promise<PermissionBoundaryMatrix> {
  const response = await fetch(`${API_BASE_URL}/permission-boundary/matrix`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<PermissionBoundaryMatrix>;
}

export async function getLatestEvaluation(): Promise<EvaluationReport | null> {
  const response = await fetch(`${API_BASE_URL}/evaluations/latest`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { report: EvaluationReport | null };
  return data.report;
}

export async function listRecentToolCalls(): Promise<ToolCallAuditItem[]> {
  const response = await fetch(`${API_BASE_URL}/tool-calls/recent?limit=6`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { toolCalls: ToolCallAuditItem[] };
  return data.toolCalls;
}

export async function getObservabilitySummary(): Promise<ObservabilitySummary> {
  const response = await fetch(`${API_BASE_URL}/observability/summary`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ObservabilitySummary>;
}

export async function getAnswerTrace(input: { answerId: string; teamSlugs: string; roles: string }): Promise<AnswerTrace> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/trace`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerTrace>;
}
