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
  idempotency?: {
    key: string;
    replayed: boolean;
    requestHash: string;
    expiresAt: string;
  };
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

export type IndexingJobStatus = {
  id: string;
  name: string;
  queueName: string;
  state: string;
  data: {
    path: string;
    requestedAt: string;
    source: "api" | "smoke";
  };
  progress: boolean | number | object | string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  durationMs?: number | null;
  failedReason?: string;
  result?: IngestResponse | null;
};

export type IndexingQueueHealth = {
  queueName: string;
  generatedAt: string;
  counts: Record<"waiting" | "active" | "completed" | "failed" | "delayed" | "paused", number>;
  recent: IndexingJobStatus[];
  worker: {
    queueName: string;
    running: boolean;
    concurrency: number;
  };
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

export type DocumentIndexExplainReport = {
  schemaVersion: "opspilot.document_index_explain.v1";
  generatedAt: string;
  document: {
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    latestVersion: number;
    updatedAt: string;
    contentHash: string;
    metadata: Record<string, unknown>;
  };
  pipeline: {
    source: "markdown";
    parser: "frontmatter_markdown_v1";
    redaction: "security_redaction_v1";
    chunking: "heading_paragraph_window_v1";
    embedding: "local_hash_embedding_64d";
    vectorStore: "pgvector_hnsw";
    lexicalMirror: "optional_elasticsearch";
  };
  summary: {
    chunkCount: number;
    totalContentLength: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    headingCoverageRatio: number;
    uniqueHeadingCount: number;
    latestDiffChangedLineCount: number;
    searchReady: boolean;
    embeddingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
  };
  checks: Array<{
    id: "chunks_present" | "embedding_coverage" | "heading_signal" | "chunk_size" | "version_trace" | "security_metadata";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    evidence: string;
  }>;
  headingOutline: Array<{
    heading: string;
    chunkIndexes: number[];
    chunkCount: number;
  }>;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    heading?: string | null;
    contentLength: number;
    tokenEstimate: number;
    embeddingStored: boolean;
    embeddingDimensions: number;
    preview: string;
    retrievalHints: string[];
    createdAt: string;
  }>;
  latestDiff: DocumentVersionDiff | null;
  recommendations: string[];
};

export type DocumentImpactReport = {
  generatedAt: string;
  document: {
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    latestVersion: number;
    updatedAt: string;
    contentHash: string;
  };
  summary: {
    affectedAnswerCount: number;
    affectedQuestionCount: number;
    topSourceAnswerCount: number;
    staleAnswerCount: number;
    humanReviewAnswerCount: number;
    latestAnswerAt: string | null;
    riskLevel: "low" | "medium" | "high";
  };
  recommendations: string[];
  affectedAnswers: Array<{
    answerId: string;
    questionId: string;
    question: string;
    answerPreview: string;
    confidence: number;
    needsHumanReview: boolean;
    answerCreatedAt: string;
    sourceRank: number;
    sourceScore: number;
    sourceChunkCount: number;
    staleAfterDocumentUpdate: boolean;
  }>;
};

export type DocumentRevalidationQueueReport = {
  schemaVersion: "opspilot.document_revalidation_queue.v1";
  generatedAt: string;
  status: "empty" | "ready" | "attention" | "critical";
  summary: {
    queueItemCount: number;
    affectedDocumentCount: number;
    affectedAnswerCount: number;
    highRiskItemCount: number;
    criticalItemCount: number;
    topSourceItemCount: number;
    humanReviewItemCount: number;
    restrictedItemCount: number;
    oldestStaleAnswerAt: string | null;
  };
  recommendations: string[];
  items: Array<{
    id: string;
    priority: "P0" | "P1" | "P2" | "P3";
    riskLevel: "low" | "medium" | "high" | "critical";
    reason: string;
    revalidationDueAt: string;
    staleAgeHours: number;
    document: {
      id: string;
      path: string;
      title: string;
      visibility: string;
      teamSlug?: string | null;
      latestVersion: number;
      updatedAt: string;
      contentHash: string;
    };
    answer: {
      id: string;
      questionId: string;
      question: string;
      answerPreview: string;
      confidence: number;
      needsHumanReview: boolean;
      createdAt: string;
    };
    source: {
      rank: number;
      score: number;
      chunkCount: number;
    };
    actions: string[];
    evidenceLinks: {
      documentImpact: string;
      replay: string;
      lineage: string;
      qualityGate: string;
    };
  }>;
};

export type DocumentRevalidationRunReport = {
  schemaVersion: "opspilot.document_revalidation_run.v1";
  runId: string;
  generatedAt: string;
  status: "cleared" | "needs_review" | "blocked";
  queueItem: DocumentRevalidationQueueReport["items"][number];
  decision: {
    label: string;
    recommendedAction: "close_queue_item" | "assign_human_reviewer" | "block_answer_and_rewrite";
    reasons: string[];
  };
  summary: {
    replayStatus: AnswerReplay["status"];
    qualityGateStatus: AnswerQualityGate["status"];
    lineageStatus: AnswerLineageGraph["status"];
    topSourceChanged: boolean;
    sourceOverlapRatio: number;
    currentDocumentAgreement: number;
    permissionDeniedCandidates: number;
    sourceAccessRechecked: true;
    lineageIntegrityHash: string;
  };
  checks: Array<{
    id: "queue_item_stale" | "replay_stable" | "quality_gate" | "lineage_integrity" | "source_access_rechecked";
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  artifacts: {
    replay: AnswerReplay;
    qualityGate: AnswerQualityGate;
    lineage: AnswerLineageGraph;
  };
  artifactHashes: {
    replay: string;
    qualityGate: string;
    lineage: string;
  };
  evidenceLinks: {
    queue: string;
    documentImpact: string;
    replay: string;
    lineage: string;
    qualityGate: string;
  };
  persistence: {
    stored: true;
    createdAt: string;
    reportHash: string;
  };
};

export type DocumentRevalidationRunHistoryReport = {
  schemaVersion: "opspilot.document_revalidation_run_history.v1";
  generatedAt: string;
  summary: {
    runCount: number;
    clearedCount: number;
    needsReviewCount: number;
    blockedCount: number;
    latestRunAt: string | null;
  };
  runs: Array<{
    id: string;
    createdAt: string;
    status: DocumentRevalidationRunReport["status"];
    document: {
      id: string;
      path: string;
      title: string;
    };
    answer: {
      id: string;
      questionId: string | null;
      question: string | null;
    };
    actor: Record<string, unknown>;
    decision: DocumentRevalidationRunReport["decision"];
    summary: DocumentRevalidationRunReport["summary"];
    checks: DocumentRevalidationRunReport["checks"];
    evidenceLinks: DocumentRevalidationRunReport["evidenceLinks"];
    artifactHashes: DocumentRevalidationRunReport["artifactHashes"];
    reportHash: string;
  }>;
};

export type DocumentIndexQualityReport = {
  generatedAt: string;
  status: "healthy" | "warning" | "critical";
  score: number;
  summary: {
    totalDocuments: number;
    totalChunks: number;
    avgChunksPerDocument: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    publicDocuments: number;
    teamDocuments: number;
    restrictedDocuments: number;
    redactionCount: number;
    promptInjectionRiskCount: number;
    missingChunkDocuments: number;
    oversizedChunkCount: number;
    emptyChunkCount: number;
    unversionedDocuments: number;
  };
  gates: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  documents: Array<{
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    updatedAt: string;
    contentHash: string;
    chunkCount: number;
    latestVersion: number;
    contentLength: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    emptyChunkCount: number;
    oversizedChunkCount: number;
    tinyChunkCount: number;
    headingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
    promptInjectionPatternCount: number;
    checks: Array<{
      id: string;
      label: string;
      status: "pass" | "warn" | "fail";
      message: string;
    }>;
    recommendations: string[];
  }>;
};

export type DocumentIndexSnapshotReport = {
  schemaVersion: "opspilot.document_index_snapshot.v1";
  generatedAt: string;
  status: "ready" | "degraded" | "empty";
  snapshotHash: string;
  pipeline: {
    source: "markdown";
    parser: "frontmatter_markdown_v1";
    redaction: "security_redaction_v1";
    chunking: "heading_paragraph_window_v1";
    embedding: "local_hash_embedding_64d";
    vectorStore: "pgvector_hnsw";
    lexicalMirror: "optional_elasticsearch";
    snapshot: "document_chunk_manifest_v1";
  };
  summary: {
    totalDocuments: number;
    totalChunks: number;
    versionedDocuments: number;
    publicDocuments: number;
    teamDocuments: number;
    restrictedDocuments: number;
    totalContentLength: number;
    embeddingCoverageRatio: number;
    headingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRiskCount: number;
    latestDocumentUpdatedAt: string | null;
    qualityStatus: DocumentIndexQualityReport["status"];
    qualityScore: number;
  };
  documents: Array<{
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    contentHash: string;
    chunkSetHash: string;
    latestVersion: number;
    versionCount: number;
    chunkCount: number;
    embeddingChunkCount: number;
    totalContentLength: number;
    headingChunkCount: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
    updatedAt: string;
  }>;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
    includedFields: string[];
  };
  recommendations: string[];
};

export type RetrievalPreviewResponse = {
  query: string;
  limit: number;
  permissionAudit: AskResponse["permissionAudit"];
  diagnostics: {
    status: "ready" | "review" | "blocked";
    recommendedAction: "answer" | "answer_with_context_review" | "human_review" | "clarify_or_expand_sources";
    confidenceEstimate: number;
    topScore: number;
    scoreGap: number;
    queryTerms: string[];
    queryPlan: {
      mode: "vector" | "hybrid";
      scoreFormula: string;
      candidateWindow: number;
      thresholds: {
        confidence: number;
        topScore: number;
        contextTokenBudget: number;
        maxContextChunks: number;
      };
      stages: Array<{
        id: string;
        label: string;
        status: "pass" | "warn" | "fail";
        input: string;
        output: string;
        evidence: string;
      }>;
    };
    sourceDiversity: {
      uniqueDocumentCount: number;
      uniquePathCount: number;
      duplicatePathCount: number;
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
    checks: Array<{
      id: string;
      label: string;
      status: "pass" | "warn" | "fail";
      metric?: number;
      threshold?: number;
      message: string;
    }>;
  };
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
    rankingExplanation: {
      method: "weighted_vector_lexical_v1" | "rrf_hybrid_v1";
      matchedQueryTerms: string[];
      unmatchedQueryTerms: string[];
      scoreContributions: Array<{
        signal: "vector" | "lexical" | "rrf";
        label: string;
        weight?: number;
        value: number;
        contribution: number;
        evidence: string;
      }>;
      accessDecision: {
        decision: "allowed";
        enforcement: AskResponse["permissionAudit"]["enforcement"];
        reason: string;
      };
      reasonCodes: string[];
    };
    heading?: string | null;
    contentPreview: string;
  }>;
};

export type RetrievalProfileReport = {
  schemaVersion: "opspilot.retrieval_profile.v1";
  generatedAt: string;
  query: string;
  limit: number;
  status: "optimized" | "watch" | "risk";
  profileHash: string;
  summary: {
    endToEndMs: number;
    searchMs: number;
    diagnosticsMs: number;
    candidatePackagingMs: number;
    allowedCandidateCount: number;
    deniedCandidateCount: number;
    candidateWindow: number;
    confidenceEstimate: number;
    topScore: number;
    scoreGap: number;
    contextTokenUseRatio: number;
    mode: RetrievalPreviewResponse["diagnostics"]["queryPlan"]["mode"];
    latencyBudgetMs: number;
    latencyBudgetStatus: "pass" | "warn" | "fail";
  };
  stages: Array<{
    id: "normalize_query" | "search_with_audit" | "diagnostics" | "candidate_packaging" | "release_decision";
    label: string;
    status: "pass" | "warn" | "fail";
    durationMs: number;
    budgetMs: number;
    input: string;
    output: string;
    evidence: string;
  }>;
  bottlenecks: Array<{
    id: string;
    label: string;
    severity: "info" | "warn" | "critical";
    message: string;
    action: string;
  }>;
  preview: RetrievalPreviewResponse;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
    includedFields: string[];
  };
};

export type RetrievalRobustnessReport = {
  schemaVersion: "opspilot.retrieval_robustness.v1";
  generatedAt: string;
  baselineQuestion: string;
  status: "stable" | "review" | "unstable";
  recommendedAction: "answer" | "review_top_sources" | "rewrite_query_or_add_docs";
  summary: {
    variantCount: number;
    topSourceStability: number;
    averageSourceOverlap: number;
    averageConfidenceEstimate: number;
    maxScoreDelta: number;
    permissionDeniedTotal: number;
  };
  checks: Array<{
    id: "top_source_stability" | "source_overlap" | "confidence_floor" | "score_drift" | "permission_boundary";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  baseline: RetrievalRobustnessRun;
  variants: RetrievalRobustnessRun[];
};

export type RetrievalRobustnessRun = {
  query: string;
  rank: number;
  diagnosticsStatus: RetrievalPreviewResponse["diagnostics"]["status"];
  recommendedAction: RetrievalPreviewResponse["diagnostics"]["recommendedAction"];
  confidenceEstimate: number;
  topScore: number;
  topSourcePath: string | null;
  topSourceTitle: string | null;
  sourcePaths: string[];
  sourceOverlapWithBaseline: number;
  topSourceMatchesBaseline: boolean;
  permissionDeniedCount: number;
  queryTerms: string[];
};

export type RetrievalPermissionDiffReport = {
  schemaVersion: "opspilot.retrieval_permission_diff.v1";
  generatedAt: string;
  query: string;
  status: "isolated" | "review";
  summary: {
    personaCount: number;
    uniqueTopSourceCount: number;
    maxDeniedCandidateCount: number;
    unprivilegedRestrictedCandidateCount: number;
    privilegedRestrictedCandidateCount: number;
    topSourceChangedCount: number;
  };
  checks: Array<{
    id: "restricted_isolation" | "team_scope" | "privileged_visibility" | "top_source_diff" | "candidate_window";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  personas: Array<{
    id: string;
    label: string;
    roles: string[];
    teamSlugs: string[];
    diagnosticsStatus: RetrievalPreviewResponse["diagnostics"]["status"];
    recommendedAction: RetrievalPreviewResponse["diagnostics"]["recommendedAction"];
    allowedCandidateCount: number;
    deniedCandidateCount: number;
    deniedByVisibility: Record<string, number>;
    topSourcePath: string | null;
    topSourceTitle: string | null;
    topSourceVisibility: string | null;
    topSourceScore: number;
    candidates: Array<{
      rank: number;
      path: string;
      title: string;
      visibility: string;
      teamSlug?: string | null;
      score: number;
      reasonCodes: string[];
    }>;
  }>;
  comparisons: Array<{
    from: string;
    to: string;
    topSourceChanged: boolean;
    deniedCandidateDelta: number;
    newlyVisiblePaths: string[];
    noLongerVisiblePaths: string[];
  }>;
};

export type IncidentResponsePlan = {
  planId: string;
  generatedAt: string;
  incident: string;
  severity: "sev1" | "sev2" | "sev3";
  confidence: number;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  permissionAudit: AskResponse["permissionAudit"];
  sources: Array<{
    rank: number;
    title: string;
    path: string;
    visibility: string;
    teamSlug?: string | null;
    score: number;
  }>;
  runbook: {
    matched: boolean;
    title?: string;
    path?: string;
    itemCount: number;
  };
  phases: Array<{
    id: "triage" | "mitigation" | "communication" | "recovery";
    title: string;
    objective: string;
    steps: Array<{
      order: number;
      action: string;
      sourcePath?: string;
      requiresApproval: boolean;
      evidence: string;
    }>;
  }>;
  approvalGates: Array<{
    action: string;
    reason: string;
    policy: "human_required";
  }>;
  communications: Array<{
    channel: string;
    message: string;
    trigger: string;
  }>;
  verification: Array<{
    check: string;
    expected: string;
    sourcePath?: string;
  }>;
  audit: {
    persistedQuestionId: string;
    toolCalls: Array<{
      toolName: "search_documents" | "create_runbook_checklist" | "create_incident_response_plan";
      status: string;
    }>;
    guardrails: string[];
  };
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

export type EvaluationCaseReport = {
  suiteName: string;
  runId: string;
  createdAt: string;
  total: number;
  summary: {
    passed: number;
    warning: number;
    failed: number;
    highRisk: number;
    lowestAgreement: number;
    missingCitation: number;
  };
  thresholds: EvaluationReport["thresholds"];
  cases: Array<{
    id: string;
    status: "pass" | "warn" | "fail";
    riskLevel: "low" | "medium" | "high";
    expectedSources: string[];
    actualSources: string[];
    topSource: string | null;
    confidence: number;
    documentAgreement: number;
    needsHumanReview: boolean;
    citationPresent: boolean;
    checks: Array<{
      id: "source_hit" | "top_source" | "human_review" | "document_agreement" | "citation";
      label: string;
      status: "pass" | "warn" | "fail";
      metric?: number;
      threshold?: number;
      evidence: string;
    }>;
    recommendations: string[];
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

export type AuditLedgerReport = {
  schemaVersion: "opspilot.audit_ledger.v1";
  generatedAt: string;
  algorithm: "sha256";
  canonicalization: "stable_json_v1";
  verified: boolean;
  rootHash: string;
  window: {
    limit: number;
    eventCount: number;
    firstEventAt: string | null;
    lastEventAt: string | null;
  };
  summary: {
    byType: Record<"question" | "answer" | "tool_call" | "approval" | "feedback" | "revalidation_run", number>;
    byStatus: Record<string, number>;
    questionLinkedEvents: number;
    tamperEvident: boolean;
  };
  events: Array<{
    sequence: number;
    id: string;
    type: "question" | "answer" | "tool_call" | "approval" | "feedback" | "revalidation_run";
    questionId: string | null;
    status: string;
    createdAt: string;
    payload: Record<string, unknown>;
    previousHash: string;
    eventHash: string;
    chainHash: string;
  }>;
};

export type AgentToolDefinition = {
  name: string;
  category: "retrieval" | "runbook" | "approval" | "incident";
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
      evidenceSnippets: Array<{
        text: string;
        matchedTokenCount: number;
        matchedTokens: string[];
      }>;
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

export type AnswerEvidenceBundle = {
  schemaVersion: "opspilot.answer_evidence_bundle.v1";
  answerId: string;
  questionId: string;
  generatedAt: string;
  actorBoundary: {
    roles: string[];
    teamSlugs: string[];
    sourceAccessRechecked: true;
  };
  summary: {
    proofStatus: AnswerProof["status"];
    proofScore: number;
    replayStatus: AnswerReplay["status"];
    needsHumanReview: boolean;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceOverlapRatio: number;
    permissionDeniedCandidates: number;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
  artifacts: {
    trace: AnswerTrace;
    proof: AnswerProof;
    replay: AnswerReplay;
  };
};

export type AnswerQualityGate = {
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "pass" | "review" | "block";
  score: number;
  decision: {
    label: string;
    recommendedAction: "share" | "review_before_share" | "block_and_rework";
    reasons: string[];
  };
  thresholds: {
    minConfidence: number;
    minDocumentAgreement: number;
    minGroundingCoverage: number;
    minSourceOverlap: number;
  };
  summary: {
    proofStatus: AnswerProof["status"];
    replayStatus: AnswerReplay["status"];
    needsHumanReview: boolean;
    approvalStatus: "not_required" | "approved" | "pending" | "rejected" | "missing";
    positiveFeedbackCount: number;
    negativeFeedbackCount: number;
    confidence: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceOverlapRatio: number;
    sourceAccessRechecked: true;
  };
  checks: Array<{
    id:
      | "proof_verified"
      | "replay_stable"
      | "approval_resolved"
      | "feedback_signal"
      | "confidence_floor"
      | "document_agreement"
      | "grounding_coverage"
      | "source_overlap"
      | "permission_boundary";
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  evidenceLinks: {
    trace: string;
    proof: string;
    replay: string;
    evidenceBundle: string;
  };
};

export type AnswerLineageGraph = {
  schemaVersion: "opspilot.answer_lineage_graph.v1";
  answerId: string;
  questionId: string;
  generatedAt: string;
  status: "verified" | "review_required" | "incomplete";
  summary: {
    nodeCount: number;
    edgeCount: number;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    feedbackCount: number;
    restrictedSourceCount: number;
    pendingApprovalCount: number;
    documentAgreementScore: number;
    groundingCoverageRatio: number;
    sourceAccessRechecked: true;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
  nodes: Array<{
    id: string;
    kind: "question" | "answer" | "source" | "tool" | "approval" | "feedback" | "gate";
    label: string;
    status: string;
    occurredAt?: string;
    detail: Record<string, unknown>;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label: string;
    kind: "created" | "grounded_by" | "called" | "requires" | "rated" | "checks";
  }>;
};

export type QuestionAuditBundle = {
  schemaVersion: "opspilot.question_audit_bundle.v1";
  questionId: string;
  generatedAt: string;
  actorBoundary: {
    roles: string[];
    teamSlugs: string[];
    sourceAccessRechecked: true;
  };
  question: {
    id: string;
    text: string;
    channel: string | null;
    actor: Record<string, unknown>;
    createdAt: string;
  };
  summary: {
    status: "verified" | "review_required" | "policy_violation" | "insufficient_evidence";
    answerCount: number;
    sourceCount: number;
    toolCallCount: number;
    approvalCount: number;
    pendingApprovalCount: number;
    feedbackCount: number;
    policyCheckCount: number;
    passedPolicyCheckCount: number;
    needsHumanReview: boolean;
    documentAgreementAverage: number;
    deniedCandidateCount: number;
  };
  policyChecks: Array<{
    toolCallId: string;
    toolName: string;
    category: string;
    sideEffect: string;
    approvalPolicy: string;
    expectedStatus: string;
    actualStatus: string;
    status: "pass" | "fail";
    evidence: string;
  }>;
  evidence: {
    sources: Array<{
      answerId: string | null;
      rank: number;
      score: number;
      documentId: string | null;
      chunkId: string | null;
      title: string;
      path: string;
      visibility: string;
      teamSlug: string | null;
      contentPreview: string | null;
    }>;
    toolCalls: Array<{
      id: string;
      toolName: string;
      status: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      createdAt: string;
    }>;
  };
  decisionPath: Array<{
    order: number;
    kind: "question" | "answer" | "source" | "tool" | "approval" | "feedback" | "policy";
    title: string;
    status: string;
    at: string;
    detail: Record<string, unknown>;
  }>;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
  };
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
  apiRequests: {
    total: number;
    last24h: number;
    successRate: number;
    errorRate: number;
    p95DurationMs: number;
  };
};

export type ApiRequestObservabilityReport = {
  generatedAt: string;
  window: "last_24h";
  summary: {
    total: number;
    successRate: number;
    errorRate: number;
    p50DurationMs: number;
    p95DurationMs: number;
  };
  byEndpoint: Array<{
    method: string;
    route: string;
    total: number;
    successRate: number;
    errorRate: number;
    p50DurationMs: number;
    p95DurationMs: number;
    lastSeenAt: string;
  }>;
  recent: Array<{
    id: string;
    method: string;
    route: string;
    path: string;
    statusCode: number;
    durationMs: number;
    actorHash?: string | null;
    roles: string[];
    teamSlugs: string[];
    errorName?: string | null;
    createdAt: string;
  }>;
};

export type ErrorBudgetReport = {
  schemaVersion: "opspilot.error_budget.v1";
  generatedAt: string;
  status: "healthy" | "watch" | "page" | "freeze";
  objective: {
    availabilityTarget: number;
    allowedErrorRate: number;
    window: "rolling_24h";
    minimumRequestVolume: number;
  };
  summary: {
    totalRequests: number;
    totalErrors: number;
    availability: number;
    errorRate: number;
    errorBudgetRemaining: number;
    worstBurnRate: number;
    releaseRecommendation: "ship" | "watch" | "freeze";
  };
  windows: Array<{
    id: "5m" | "1h" | "24h";
    label: string;
    durationMinutes: number;
    requestCount: number;
    errorCount: number;
    availability: number;
    errorRate: number;
    allowedErrorRate: number;
    burnRate: number;
    errorBudgetRemaining: number;
    status: "healthy" | "watch" | "page" | "freeze";
  }>;
  topOffenders: Array<{
    method: string;
    route: string;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    p95DurationMs: number;
    lastSeenAt: string;
  }>;
  actions: Array<{
    priority: "p0" | "p1" | "p2";
    owner: "platform" | "ops" | "quality";
    title: string;
    reason: string;
    verification: string[];
  }>;
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
    source: "answers" | "tool_calls" | "evaluations" | "api_requests";
    window: "all_time" | "latest_eval" | "last_24h";
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

export type OperationalActionPlan = {
  schemaVersion: "opspilot.operational_action_plan.v1";
  generatedAt: string;
  status: ObservabilityReleaseGate["status"];
  summary: {
    actionCount: number;
    p0: number;
    p1: number;
    p2: number;
    owners: Array<"platform" | "rag" | "ops" | "quality">;
    releaseRecommendation: "ship" | "ship_after_review" | "hold";
  };
  actions: Array<{
    id: string;
    title: string;
    priority: "p0" | "p1" | "p2";
    owner: "platform" | "rag" | "ops" | "quality";
    status: "open" | "watch";
    source: "release_gate" | "slo" | "operational_watch";
    sourceId: string;
    reason: string;
    impact: string;
    actionItems: string[];
    verification: string[];
    links: Array<{
      label: string;
      href: string;
    }>;
  }>;
};

export type PortfolioReadinessReport = {
  schemaVersion: "opspilot.portfolio_readiness.v1";
  generatedAt: string;
  status: ObservabilityReleaseGate["status"];
  score: number;
  headline: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    evidenceCount: number;
    actionCount: number;
    releaseRecommendation: OperationalActionPlan["summary"]["releaseRecommendation"];
    documents: number;
    chunks: number;
    averageDocumentAgreement: number;
    apiSuccessRate: number;
  };
  pillars: Array<{
    id: "rag_grounding" | "permission_boundary" | "tool_audit" | "operational_reliability" | "demo_artifacts";
    label: string;
    status: "pass" | "warn" | "fail";
    score: number;
    evidence: string;
    whyItMatters: string;
    demoScript: string;
    verification: string[];
    links: Array<{
      label: string;
      href: string;
    }>;
  }>;
  demoPath: Array<{
    step: number;
    screen: string;
    action: string;
    proof: string;
  }>;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function askOpsPilot(input: {
  question: string;
  teamSlugs: string;
  roles: string;
  idempotencyKey?: string;
}): Promise<AskResponse> {
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles,
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({ question: input.question, channel: "web" })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AskResponse>;
}

function createIdempotencyKey(): string {
  const randomValue =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `web:${randomValue}`;
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

export async function profileRetrieval(input: {
  question: string;
  teamSlugs: string;
  roles: string;
  limit: number;
}): Promise<RetrievalProfileReport> {
  const response = await fetch(`${API_BASE_URL}/retrieval/profile`, {
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

  return response.json() as Promise<RetrievalProfileReport>;
}

export async function analyzeRetrievalRobustness(input: {
  question: string;
  teamSlugs: string;
  roles: string;
  limit: number;
  variants?: string[];
}): Promise<RetrievalRobustnessReport> {
  const response = await fetch(`${API_BASE_URL}/retrieval/robustness`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    },
    body: JSON.stringify({ question: input.question, variants: input.variants, limit: input.limit })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<RetrievalRobustnessReport>;
}

export async function analyzeRetrievalPermissionDiff(input: {
  question: string;
  teamSlugs: string;
  roles: string;
  limit: number;
}): Promise<RetrievalPermissionDiffReport> {
  const currentRoles = splitCsv(input.roles);
  const currentTeamSlugs = splitCsv(input.teamSlugs);
  const personas = [
    ...(currentRoles.length > 0 || currentTeamSlugs.length > 0
      ? [{ id: "current_actor", label: "현재 호출자", roles: currentRoles, teamSlugs: currentTeamSlugs }]
      : []),
    { id: "public_viewer", label: "공개 사용자", roles: [], teamSlugs: [] },
    { id: "support_agent", label: "고객지원 담당자", roles: ["support_agent"], teamSlugs: [] },
    { id: "payments_oncall", label: "결제 온콜", roles: ["support_agent", "oncall"], teamSlugs: ["payments"] },
    { id: "ops_admin", label: "운영 관리자", roles: ["ops_admin"], teamSlugs: ["payments"] }
  ].slice(0, 6);
  const response = await fetch(`${API_BASE_URL}/retrieval/permission-diff`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    },
    body: JSON.stringify({ question: input.question, personas, limit: input.limit })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<RetrievalPermissionDiffReport>;
}

export async function createIncidentPlan(input: {
  incident: string;
  teamSlugs?: string;
  roles?: string;
  limit?: number;
}): Promise<IncidentResponsePlan> {
  const response = await fetch(`${API_BASE_URL}/incidents/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs ?? "",
      "x-user-roles": input.roles ?? "",
      "x-roles": input.roles ?? ""
    },
    body: JSON.stringify({ incident: input.incident, limit: input.limit })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<IncidentResponsePlan>;
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

export async function enqueueMarkdownIndexingJob(input: { path: string; markdown: string }): Promise<IndexingJobStatus> {
  const response = await fetch(`${API_BASE_URL}/documents/indexing-jobs/markdown`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<IndexingJobStatus>;
}

export async function getIndexingQueueHealth(): Promise<IndexingQueueHealth> {
  const response = await fetch(`${API_BASE_URL}/documents/indexing-jobs`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<IndexingQueueHealth>;
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

export async function getDocumentIndexExplain(documentId: string): Promise<DocumentIndexExplainReport> {
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/index-explain`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentIndexExplainReport>;
}

export async function getDocumentIndexSnapshot(): Promise<DocumentIndexSnapshotReport> {
  const response = await fetch(`${API_BASE_URL}/documents/index-snapshot`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentIndexSnapshotReport>;
}

export async function getDocumentImpact(documentId: string): Promise<DocumentImpactReport> {
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/impact`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentImpactReport>;
}

export async function getDocumentRevalidationQueue(): Promise<DocumentRevalidationQueueReport> {
  const response = await fetch(`${API_BASE_URL}/documents/revalidation-queue?limit=500`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentRevalidationQueueReport>;
}

export async function getDocumentRevalidationRuns(): Promise<DocumentRevalidationRunHistoryReport> {
  const response = await fetch(`${API_BASE_URL}/documents/revalidation-runs?limit=20`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentRevalidationRunHistoryReport>;
}

export async function runDocumentRevalidation(input: {
  documentId: string;
  answerId: string;
  teamSlugs: string;
  roles: string;
}): Promise<DocumentRevalidationRunReport> {
  const response = await fetch(`${API_BASE_URL}/documents/revalidation-runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles
    },
    body: JSON.stringify({
      documentId: input.documentId,
      answerId: input.answerId
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentRevalidationRunReport>;
}

export async function getDocumentIndexQuality(): Promise<DocumentIndexQualityReport> {
  const response = await fetch(`${API_BASE_URL}/documents/index-quality`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<DocumentIndexQualityReport>;
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

export async function getEvaluationCases(): Promise<EvaluationCaseReport | null> {
  const response = await fetch(`${API_BASE_URL}/evaluations/cases`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { report: EvaluationCaseReport | null };
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

export async function getAuditLedger(limit = 40): Promise<AuditLedgerReport> {
  const response = await fetch(`${API_BASE_URL}/observability/audit-ledger?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AuditLedgerReport>;
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

export async function getApiRequestObservability(): Promise<ApiRequestObservabilityReport> {
  const response = await fetch(`${API_BASE_URL}/observability/api-requests`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ApiRequestObservabilityReport>;
}

export async function getErrorBudget(): Promise<ErrorBudgetReport> {
  const response = await fetch(`${API_BASE_URL}/observability/error-budget`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<ErrorBudgetReport>;
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

export async function getPortfolioReadiness(): Promise<PortfolioReadinessReport> {
  const response = await fetch(`${API_BASE_URL}/observability/portfolio-readiness`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<PortfolioReadinessReport>;
}

export async function getOperationalActionPlan(): Promise<OperationalActionPlan> {
  const response = await fetch(`${API_BASE_URL}/observability/action-plan`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<OperationalActionPlan>;
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

export async function getAnswerEvidenceBundle(input: {
  answerId: string;
  teamSlugs: string;
  roles: string;
}): Promise<AnswerEvidenceBundle> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/evidence-bundle`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerEvidenceBundle>;
}

export async function getAnswerLineage(input: {
  answerId: string;
  teamSlugs: string;
  roles: string;
}): Promise<AnswerLineageGraph> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/lineage`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerLineageGraph>;
}

export async function getAnswerQualityGate(input: {
  answerId: string;
  teamSlugs: string;
  roles: string;
}): Promise<AnswerQualityGate> {
  const response = await fetch(`${API_BASE_URL}/answers/${input.answerId}/quality-gate`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<AnswerQualityGate>;
}

export async function getQuestionAuditBundle(input: {
  questionId: string;
  teamSlugs: string;
  roles: string;
}): Promise<QuestionAuditBundle> {
  const response = await fetch(`${API_BASE_URL}/questions/${input.questionId}/audit-bundle`, {
    headers: {
      "x-team-slugs": input.teamSlugs,
      "x-user-roles": input.roles,
      "x-roles": input.roles
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<QuestionAuditBundle>;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
