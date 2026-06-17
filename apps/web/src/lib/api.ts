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
      promptInjectionRisk?: boolean;
      promptInjectionPatternCount?: number;
      promptInjectionPatterns?: string[];
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

export type EvaluationHistory = {
  suiteName: string;
  count: number;
  items: Array<{
    runId: string;
    suiteName: string;
    createdAt: string;
    total: number;
    passed: boolean;
    metrics: EvaluationReport["metrics"];
    thresholds: EvaluationReport["thresholds"];
    gates: EvaluationReport["gates"];
    deltas: Partial<Record<keyof EvaluationReport["metrics"], number | null>>;
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

export type AgentToolDefinition = {
  name: string;
  category: "retrieval" | "runbook" | "approval";
  description: string;
  sideEffect: "none" | "database_write";
  approvalPolicy: "auto_allowed" | "human_required";
  statusWhenCalled: "allowed" | "needs_approval";
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  auditFields: string[];
};

export type SlackSimulationTrace = {
  ok: boolean;
  ignored?: boolean;
  reason?: string;
  trace?: {
    eventType: string;
    channel: string;
    threadTs: string;
    user?: string;
    actor: {
      actorId?: string;
      roles: string[];
      teamSlugs: string[];
    };
    question: string;
    questionId: string;
    answerId: string;
    needsHumanReview: boolean;
    reviewReasons: string[];
    sources: Array<{
      title: string;
      path: string;
      score: number;
    }>;
    toolCalls: Array<{
      toolName: string;
      status: string;
    }>;
    reply: {
      postMode: "dry_run" | "posted" | "failed";
      blockCount: number;
      textLength: number;
    };
  };
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
    contextEstimatedTokenCount: number;
    contextTokenBudget: number;
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
  contextPackage: {
    method: "ranked_context_budget_v1";
    tokenBudget: number;
    estimatedTokenCount: number;
    remainingTokenBudget: number;
    includedChunkCount: number;
    omittedChunkCount: number;
    chunks: Array<{
      rank: number;
      title: string;
      path: string;
      score: number;
      estimatedTokens: number;
      included: boolean;
      reason: "within_budget" | "rank_cutoff" | "budget_exceeded";
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

export type AnswerProof = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "verified" | "review_required" | "insufficient_evidence";
  score: number;
  thresholds: {
    minDocumentAgreement: number;
    minGroundingCoverage: number;
  };
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  evidence: {
    sourcePaths: string[];
    toolCalls: Array<{ toolName: string; status: string }>;
    approvals: Array<{ action: string; status: string }>;
    feedbackCount: number;
    reviewReasons: string[];
    metrics: {
      confidence: number;
      documentAgreementScore: number;
      groundingCoverageRatio: number;
      contextEstimatedTokenCount: number;
      contextTokenBudget: number;
    };
  };
};

export type AnswerReplay = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "stable" | "needs_review" | "drifted";
  summary: {
    originalTopSourcePath: string | null;
    currentTopSourcePath: string | null;
    topSourceChanged: boolean;
    sourceOverlapRatio: number;
    originalDocumentAgreement: number;
    currentDocumentAgreement: number;
    currentSourceCount: number;
    permissionDeniedCandidates: number;
  };
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  originalSources: Array<{
    rank: number;
    chunkId: string;
    path: string;
    title: string;
    score: number;
  }>;
  currentSources: Array<{
    rank: number;
    chunkId: string;
    path: string;
    title: string;
    score: number;
    retrieval: {
      vectorScore?: number;
      lexicalScore?: number;
      fusedScore?: number;
      mode: "vector" | "hybrid";
    };
  }>;
  permissionAudit: AskResponse["permissionAudit"];
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

export type ObservabilitySloReport = {
  generatedAt: string;
  status: "ok" | "warn" | "breach";
  objectives: Array<{
    id: string;
    label: string;
    description: string;
    metric: string;
    operator: "gte" | "lte";
    target: number;
    actual: number;
    status: "ok" | "warn" | "breach";
    errorBudgetRemaining: number;
    source: "answers" | "tool_calls" | "evaluations";
    window: "all_time" | "latest_eval";
  }>;
};

export type ObservabilityReleaseGate = {
  generatedAt: string;
  status: "pass" | "review" | "block";
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    owner: "platform" | "rag" | "ops" | "quality";
    metric?: number;
    threshold?: number;
  }>;
  summary: {
    readinessOk: boolean;
    sloStatus: "ok" | "warn" | "breach";
    latestEvalPassed: boolean;
    pendingApprovals: number;
    documents: number;
    chunks: number;
    feedback: number;
    knowledgeFreshness: {
      latestEvalCreatedAt: string | null;
      latestDocumentUpdatedAt: string | null;
      changedDocumentsSinceEval: number;
      stale: boolean;
    };
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

export async function getEvaluationHistory(limit = 6): Promise<EvaluationHistory> {
  const response = await fetch(`${API_BASE_URL}/evaluations/history?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<EvaluationHistory>;
}

export async function listRecentToolCalls(): Promise<ToolCallAuditItem[]> {
  const response = await fetch(`${API_BASE_URL}/tool-calls/recent?limit=6`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { toolCalls: ToolCallAuditItem[] };
  return data.toolCalls;
}

export async function listAgentTools(): Promise<AgentToolDefinition[]> {
  const response = await fetch(`${API_BASE_URL}/tool-calls/registry`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { tools: AgentToolDefinition[] };
  return data.tools;
}

export async function simulateSlackMention(): Promise<SlackSimulationTrace> {
  const response = await fetch(`${API_BASE_URL}/slack/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "event_callback",
      event: {
        type: "app_mention",
        user: "UOPSDEMO",
        text: "<@UOPSPILOT> E102 에러가 발생하면 어떻게 대응해야 해?",
        channel: "COPSDEMO",
        ts: "1710000000.000100",
        thread_ts: "1710000000.000100"
      }
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<SlackSimulationTrace>;
}

export async function getObservabilitySummary(): Promise<ObservabilitySummary> {
  const response = await fetch(`${API_BASE_URL}/observability/summary`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ObservabilitySummary>;
}

export async function getObservabilitySlo(): Promise<ObservabilitySloReport> {
  const response = await fetch(`${API_BASE_URL}/observability/slo`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ObservabilitySloReport>;
}

export async function getObservabilityReleaseGate(): Promise<ObservabilityReleaseGate> {
  const response = await fetch(`${API_BASE_URL}/observability/release-gate`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ObservabilityReleaseGate>;
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

export async function getAnswerProof(input: { answerId: string; teamSlugs: string; roles: string }): Promise<AnswerProof> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/proof`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerProof>;
}

export async function getAnswerReplay(input: { answerId: string; teamSlugs: string; roles: string }): Promise<AnswerReplay> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/replay`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerReplay>;
}
