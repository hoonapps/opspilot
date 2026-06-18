import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { EmbeddingProvider, OpenAIEmbeddingProvider, TransformersEmbeddingProvider } from "@opspilot/ai";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { AgentService } from "../agent/agent.service";
import { calculateDocumentAgreement } from "../agent/document-agreement";
import { EmbeddingService } from "../agent/embedding.service";
import { SearchService } from "../agent/search.service";
import { AuthzService } from "../authz/authz.service";
import { sha256 } from "../shared/hash";
import { RequestContext } from "../shared/request-context";

export type EvalQuestion = {
  id: string;
  question: string;
  expectedSources: string[];
  actor: RequestContext;
};

export type EvalReport = {
  suiteName: string;
  total: number;
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
  passed: boolean;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
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

export type EvaluationThresholds = {
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
};

export type EvaluationGate = {
  metric: keyof EvaluationThresholds;
  score: number;
  threshold: number;
  passed: boolean;
};

export type LatestEvalReport = {
  suiteName: string;
  createdAt: string;
  total: number;
  passed: boolean;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
  metrics: {
    sourceHitRate: number;
    topSourceAccuracy: number;
    humanReviewAccuracy: number;
    documentAgreementScore: number;
    citationAccuracy: number;
  };
  rows: EvalReport["rows"];
} | null;

export type EvaluationHistoryItem = {
  runId: string;
  suiteName: string;
  createdAt: string;
  total: number;
  passed: boolean;
  metrics: EvaluationMetrics;
  thresholds: EvaluationThresholds;
  gates: EvaluationGate[];
  deltas: Partial<Record<keyof EvaluationMetrics, number | null>>;
};

export type EvaluationHistory = {
  suiteName: string;
  count: number;
  items: EvaluationHistoryItem[];
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
  thresholds: EvaluationThresholds;
  cases: EvaluationCaseDetail[];
};

export type EvaluationCaseDetail = {
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
};

export type EvaluationRegressionReport = {
  schemaVersion: "opspilot.evaluation_regression.v1";
  suiteName: string;
  generatedAt: string;
  status: "promote" | "watch" | "block";
  releaseDecision: {
    label: string;
    reason: string;
    requiredAction: string;
  };
  current: {
    runId: string;
    createdAt: string;
    passed: boolean;
    total: number;
    metrics: EvaluationMetrics;
  };
  previous: {
    runId: string;
    createdAt: string;
    passed: boolean;
    metrics: EvaluationMetrics;
  } | null;
  summary: {
    failedGateCount: number;
    degradedMetricCount: number;
    highRiskCaseCount: number;
    failedCaseCount: number;
    missingCitationCount: number;
    lowestDocumentAgreement: number;
  };
  metricDeltas: Array<{
    metric: keyof EvaluationMetrics;
    current: number;
    previous: number | null;
    delta: number | null;
    status: "improved" | "stable" | "degraded" | "new";
    threshold: number;
    gatePassed: boolean;
  }>;
  failedGates: EvaluationGate[];
  highRiskCases: Array<{
    id: string;
    status: EvaluationCaseDetail["status"];
    riskLevel: EvaluationCaseDetail["riskLevel"];
    topSource: string | null;
    expectedSources: string[];
    actualSources: string[];
    documentAgreement: number;
    failedChecks: string[];
    recommendations: string[];
  }>;
  actionItems: Array<{
    id: string;
    priority: "P0" | "P1" | "P2";
    owner: "retrieval" | "prompt" | "security" | "evaluation";
    title: string;
    evidence: string;
    command: string;
  }>;
  integrity: {
    reportHash: string;
    hashAlgorithm: "sha256";
    includedFields: string[];
  };
};

export type EvaluationCoverageReport = {
  schemaVersion: "opspilot.evaluation_coverage.v1";
  suiteName: string;
  runId: string;
  generatedAt: string;
  status: "healthy" | "gaps" | "missing_eval";
  summary: {
    totalDocuments: number;
    coveredDocuments: number;
    uncoveredDocuments: number;
    coverageRatio: number;
    restrictedCoverageRatio: number;
    teamCoverageRatio: number;
    evalCaseCount: number;
    expectedSourceCount: number;
    actualSourceCount: number;
  };
  documents: Array<{
    path: string;
    title: string;
    visibility: string;
    teamSlug: string | null;
    updatedAt: string;
    coveredBy: "expected" | "actual" | "both" | "none";
    expectedCaseCount: number;
    actualHitCount: number;
    topSourceCount: number;
    averageDocumentAgreement: number;
    riskLevel: "low" | "medium" | "high";
    recommendations: string[];
  }>;
  blindSpots: Array<{
    path: string;
    title: string;
    visibility: string;
    teamSlug: string | null;
    riskLevel: "medium" | "high";
    reason: string;
    suggestedQuestion: string;
  }>;
  actionItems: Array<{
    id: string;
    priority: "P0" | "P1" | "P2";
    owner: "evaluation" | "security" | "retrieval";
    title: string;
    evidence: string;
    command: string;
  }>;
  integrity: {
    reportHash: string;
    hashAlgorithm: "sha256";
    includedFields: string[];
  };
};

export type RetrievalEvaluationReport = {
  schemaVersion: "opspilot.retrieval_evaluation.v1";
  suiteName: string;
  generatedAt: string;
  total: number;
  status: "pass" | "warn" | "fail";
  metrics: {
    recallAt1: number;
    recallAt3: number;
    recallAt5: number;
    mrr: number;
    ndcgAt5: number;
    averageFirstRelevantRank: number | null;
  };
  baselineMetrics: {
    recallAt1: number;
    recallAt3: number;
    recallAt5: number;
    mrr: number;
    ndcgAt5: number;
    averageFirstRelevantRank: number | null;
  };
  reranking: {
    enabled: boolean;
    method: "local_bm25_keytoken_v1";
    candidateWindow: number;
    changedTopSourceCount: number;
    deltas: {
      recallAt1: number;
      recallAt3: number;
      mrr: number;
      ndcgAt5: number;
    };
  };
  thresholds: {
    recallAt3: number;
    mrr: number;
  };
  gates: Array<{
    metric: "recallAt3" | "mrr";
    score: number;
    threshold: number;
    passed: boolean;
  }>;
  rows: Array<{
    id: string;
    question: string;
    expectedSources: string[];
    baseRankedSources: string[];
    baseFirstRelevantRank: number | null;
    baseReciprocalRank: number;
    baseRecallAt1: boolean;
    baseRecallAt3: boolean;
    baseRecallAt5: boolean;
    baseNdcgAt5: number;
    rankedSources: string[];
    firstRelevantRank: number | null;
    reciprocalRank: number;
    recallAt1: boolean;
    recallAt3: boolean;
    recallAt5: boolean;
    ndcgAt5: number;
    rankDelta: number | null;
    permissionEnforcement: string;
    deniedCandidateCount: number;
  }>;
  actionItems: Array<{
    id: string;
    priority: "P0" | "P1" | "P2";
    owner: "retrieval" | "embedding" | "reranking";
    title: string;
    evidence: string;
    command: string;
  }>;
  integrity: {
    reportHash: string;
    hashAlgorithm: "sha256";
    includedFields: string[];
  };
};

export type EmbeddingComparisonReport = {
  schemaVersion: "opspilot.embedding_comparison.v1";
  suiteName: string;
  generatedAt: string;
  status: "pass" | "warn" | "fail" | "skipped";
  total: number;
  dimensions: number;
  baseline: {
    provider: "local_hash_embedding";
    model: "fnv_token_bucket_64d";
    metrics: RetrievalMetricSummary;
  };
  candidate: {
    provider: "openai" | "transformers";
    model: string;
    available: boolean;
    skippedReason?: string;
    metrics: RetrievalMetricSummary | null;
    deltas: {
      recallAt1: number | null;
      recallAt3: number | null;
      mrr: number | null;
      ndcgAt5: number | null;
    };
  };
  rows: Array<{
    id: string;
    question: string;
    expectedSources: string[];
    localRankedSources: string[];
    localFirstRelevantRank: number | null;
    localRecallAt3: boolean;
    localNdcgAt5: number;
    candidateRankedSources: string[];
    candidateFirstRelevantRank: number | null;
    candidateRecallAt3: boolean | null;
    candidateNdcgAt5: number | null;
    rankDelta: number | null;
  }>;
  actionItems: Array<{
    id: string;
    priority: "P0" | "P1" | "P2";
    owner: "embedding" | "evaluation";
    title: string;
    evidence: string;
    command: string;
  }>;
  integrity: {
    reportHash: string;
    hashAlgorithm: "sha256";
    includedFields: string[];
  };
};

type RetrievalMetricSummary = {
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
  ndcgAt5: number;
  averageFirstRelevantRank: number | null;
};

export type EvaluationMetrics = {
  sourceHitRate: number;
  topSourceAccuracy: number;
  humanReviewAccuracy: number;
  documentAgreementScore: number;
  citationAccuracy: number;
};

type EvaluationMetricRow = {
  metric_name: string;
  score: number;
  details: EvaluationMetricDetails;
  created_at: Date | string;
};

type EvaluationMetricDetails = {
  runId?: string;
  total?: number;
  rows?: EvalReport["rows"];
  thresholds?: EvaluationThresholds;
  gates?: EvaluationGate[];
  metrics?: EvaluationMetrics;
  passed?: boolean;
};

type EvaluationDocumentRow = {
  path: string;
  title: string;
  visibility: string;
  team_slug?: string | null;
  updated_at: Date | string;
};

type EmbeddingComparisonChunkRow = {
  chunkId: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  content: string;
};

type EmbeddingComparisonRankRow = {
  id: string;
  question: string;
  expectedSources: string[];
  rankedSources: string[];
  firstRelevantRank: number | null;
  reciprocalRank: number;
  recallAt1: boolean;
  recallAt3: boolean;
  recallAt5: boolean;
  ndcgAt5: number;
};

const METRIC_NAMES = {
  source_hit_rate: "sourceHitRate",
  top_source_accuracy: "topSourceAccuracy",
  human_review_accuracy: "humanReviewAccuracy",
  document_agreement_score: "documentAgreementScore",
  citation_accuracy: "citationAccuracy"
} as const;

type StoredMetricName = keyof typeof METRIC_NAMES;

@Injectable()
export class EvaluationService {
  constructor(
    private readonly orm: MikroORM,
    private readonly agent: AgentService,
    private readonly search: SearchService,
    private readonly embeddings: EmbeddingService,
    private readonly authz: AuthzService
  ) {}

  async run(suiteName: string, questions: EvalQuestion[]): Promise<EvalReport> {
    const runId = randomUUID();
    const rows = [];
    for (const item of questions) {
      const response = await this.agent.ask(item.question, item.actor, "eval");
      const actualSources = response.sources.map((source) => source.path);
      const sourceContents = await this.loadSourceContents(response.sources.map((source) => source.chunkId));
      const hit = item.expectedSources.some((expected) => actualSources.includes(expected));
      const citationPresent = answerCitesReturnedSource(
        response.answer,
        response.sources.map((source) => ({ title: source.title, path: source.path }))
      );
      rows.push({
        id: item.id,
        hit,
        needsHumanReview: response.needsHumanReview,
        expectedSources: item.expectedSources,
        actualSources,
        confidence: response.confidence,
        documentAgreement: calculateDocumentAgreement(response.answer, sourceContents).score,
        citationPresent
      });
    }

    const sourceHitRate = ratio(rows.filter((row) => row.hit).length, rows.length);
    const topSourceAccuracy = ratio(
      rows.filter((row) => itemMatchesTopSource(row.expectedSources, row.actualSources)).length,
      rows.length
    );
    const humanReviewAccuracy = ratio(
      rows.filter((row) => {
        const restrictedExpected = row.expectedSources.some((source) => source.includes("restricted/"));
        return restrictedExpected ? row.needsHumanReview : true;
      }).length,
      rows.length
    );
    const documentAgreementScore = average(rows.map((row) => row.documentAgreement));
    const citationAccuracy = ratio(rows.filter((row) => row.citationPresent).length, rows.length);
    const metrics = {
      sourceHitRate,
      topSourceAccuracy,
      humanReviewAccuracy,
      documentAgreementScore,
      citationAccuracy
    };
    const thresholds = evaluationThresholdsFromEnv();
    const gates = buildEvaluationGates(metrics, thresholds);
    const passed = gates.every((gate) => gate.passed);

    const report: EvalReport = {
      suiteName,
      total: rows.length,
      sourceHitRate,
      topSourceAccuracy,
      humanReviewAccuracy,
      documentAgreementScore,
      citationAccuracy,
      passed,
      thresholds,
      gates,
      rows
    };
    const details = JSON.stringify({ runId, total: rows.length, rows, thresholds, gates, metrics, passed });

    await this.orm.em.fork().getConnection().execute(
      `
        insert into evaluation_results (suite_name, metric_name, score, details)
        values
          (?, 'source_hit_rate', ?, ?::jsonb),
          (?, 'top_source_accuracy', ?, ?::jsonb),
          (?, 'human_review_accuracy', ?, ?::jsonb),
          (?, 'document_agreement_score', ?, ?::jsonb),
          (?, 'citation_accuracy', ?, ?::jsonb);
      `,
      [
        suiteName,
        sourceHitRate,
        details,
        suiteName,
        topSourceAccuracy,
        details,
        suiteName,
        humanReviewAccuracy,
        details,
        suiteName,
        documentAgreementScore,
        details,
        suiteName,
        citationAccuracy,
        details
      ]
    );

    return report;
  }

  async latest(suiteName: string): Promise<{ report: LatestEvalReport }> {
    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select metric_name, score, details, created_at
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit 50;
      `,
      [suiteName]
    )) as EvaluationMetricRow[];

    if (rows.length === 0) {
      return { report: null };
    }

    const grouped = groupEvaluationRows(rows);
    const [runId, latestRows] = [...grouped.entries()].sort(
      ([, leftRows], [, rightRows]) => getNewestTimestamp(rightRows) - getNewestTimestamp(leftRows)
    )[0];
    const item = buildHistoryItem(suiteName, runId, latestRows);
    const details = normalizeDetails(getNewestRow(latestRows).details);

    return {
      report: {
        suiteName,
        createdAt: item.createdAt,
        total: item.total,
        passed: item.passed,
        thresholds: item.thresholds,
        gates: item.gates,
        metrics: item.metrics,
        rows: details.rows ?? []
      }
    };
  }

  async history(suiteName: string, limit = 8): Promise<EvaluationHistory> {
    const requestedLimit = Number.isFinite(limit) ? limit : 8;
    const boundedLimit = Math.max(1, Math.min(requestedLimit, 20));
    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select metric_name, score, details, created_at
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit ?;
      `,
      [suiteName, boundedLimit * 10]
    )) as EvaluationMetricRow[];

    const grouped = groupEvaluationRows(rows);

    const items = [...grouped.entries()]
      .map(([runId, groupRows]) => buildHistoryItem(suiteName, runId, groupRows))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, boundedLimit);

    return {
      suiteName,
      count: items.length,
      items: items.map((item, index) => ({
        ...item,
        deltas: buildMetricDeltas(item.metrics, items[index + 1]?.metrics)
      }))
    };
  }

  async cases(suiteName: string): Promise<{ report: EvaluationCaseReport | null }> {
    const latest = await this.latest(suiteName);
    if (!latest.report) {
      return { report: null };
    }

    const runId = await this.latestRunId(suiteName);
    const thresholds = latest.report.thresholds;
    const cases = latest.report.rows.map((row) => buildEvaluationCase(row, thresholds));

    return {
      report: {
        suiteName,
        runId,
        createdAt: latest.report.createdAt,
        total: cases.length,
        summary: {
          passed: cases.filter((item) => item.status === "pass").length,
          warning: cases.filter((item) => item.status === "warn").length,
          failed: cases.filter((item) => item.status === "fail").length,
          highRisk: cases.filter((item) => item.riskLevel === "high").length,
          lowestAgreement: cases.length > 0 ? Math.min(...cases.map((item) => item.documentAgreement)) : 0,
          missingCitation: cases.filter((item) => !item.citationPresent).length
        },
        thresholds,
        cases
      }
    };
  }

  async regression(suiteName: string): Promise<{ report: EvaluationRegressionReport | null }> {
    const [history, casesResult] = await Promise.all([this.history(suiteName, 2), this.cases(suiteName)]);
    const current = history.items[0];
    const cases = casesResult.report;

    if (!current || !cases) {
      return { report: null };
    }

    const previous = history.items[1] ?? null;
    const metricDeltas = buildRegressionMetricDeltas(current, previous);
    const failedGates = current.gates.filter((gate) => !gate.passed);
    const highRiskCases = cases.cases
      .filter((item) => item.riskLevel === "high" || item.status === "fail")
      .map((item) => ({
        id: item.id,
        status: item.status,
        riskLevel: item.riskLevel,
        topSource: item.topSource,
        expectedSources: item.expectedSources,
        actualSources: item.actualSources,
        documentAgreement: item.documentAgreement,
        failedChecks: item.checks.filter((check) => check.status === "fail").map((check) => check.id),
        recommendations: item.recommendations
      }));
    const degradedMetricCount = metricDeltas.filter((item) => item.status === "degraded").length;
    const summary = {
      failedGateCount: failedGates.length,
      degradedMetricCount,
      highRiskCaseCount: cases.summary.highRisk,
      failedCaseCount: cases.summary.failed,
      missingCitationCount: cases.summary.missingCitation,
      lowestDocumentAgreement: cases.summary.lowestAgreement
    };
    const status: EvaluationRegressionReport["status"] =
      failedGates.length > 0 || highRiskCases.length > 0 ? "block" : degradedMetricCount > 0 ? "watch" : "promote";
    const actionItems = buildRegressionActionItems({
      failedGates,
      highRiskCases,
      metricDeltas,
      suiteName
    });
    const hashBasis = {
      suiteName,
      currentRunId: current.runId,
      previousRunId: previous?.runId ?? null,
      status,
      summary,
      metricDeltas,
      failedGates,
      highRiskCases,
      actionItems
    };
    const reportHash = sha256(stableStringify(hashBasis));

    return {
      report: {
        schemaVersion: "opspilot.evaluation_regression.v1",
        suiteName,
        generatedAt: new Date().toISOString(),
        status,
        releaseDecision: buildRegressionReleaseDecision(status, summary),
        current: {
          runId: current.runId,
          createdAt: current.createdAt,
          passed: current.passed,
          total: current.total,
          metrics: current.metrics
        },
        previous: previous
          ? {
              runId: previous.runId,
              createdAt: previous.createdAt,
              passed: previous.passed,
              metrics: previous.metrics
            }
          : null,
        summary,
        metricDeltas,
        failedGates,
        highRiskCases,
        actionItems,
        integrity: {
          reportHash,
          hashAlgorithm: "sha256",
          includedFields: ["suiteName", "runIds", "status", "summary", "metricDeltas", "failedGates", "highRiskCases", "actionItems"]
        }
      }
    };
  }

  async coverage(suiteName: string): Promise<{ report: EvaluationCoverageReport | null }> {
    const [latest, runId, documents] = await Promise.all([
      this.latest(suiteName),
      this.latestRunId(suiteName),
      this.loadEvaluationDocuments()
    ]);

    if (!latest.report) {
      return { report: null };
    }

    const rows = latest.report.rows;
    const documentReports = buildCoverageDocuments(documents, rows);
    const coveredDocuments = documentReports.filter((document) => document.coveredBy !== "none").length;
    const restrictedDocuments = documentReports.filter((document) => document.visibility === "restricted");
    const teamDocuments = documentReports.filter((document) => document.visibility === "team");
    const blindSpots = documentReports
      .filter((document) => document.coveredBy === "none")
      .sort((left, right) => coverageRiskRank(right.riskLevel) - coverageRiskRank(left.riskLevel) || left.path.localeCompare(right.path))
      .slice(0, 8)
      .map((document) => ({
        path: document.path,
        title: document.title,
        visibility: document.visibility,
        teamSlug: document.teamSlug,
        riskLevel: document.riskLevel === "low" ? ("medium" as const) : document.riskLevel,
        reason:
          document.visibility === "restricted"
            ? "제한 문서인데 최신 평가 케이스의 기대/실제 출처에 포함되지 않았습니다."
            : document.visibility === "team"
              ? "팀 문서인데 최신 평가 케이스가 이 문서를 직접 검증하지 않았습니다."
              : "공개 문서가 최신 평가 케이스의 기대/실제 출처에 포함되지 않았습니다.",
        suggestedQuestion: buildSuggestedCoverageQuestion(document)
      }));
    const summary = {
      totalDocuments: documentReports.length,
      coveredDocuments,
      uncoveredDocuments: documentReports.length - coveredDocuments,
      coverageRatio: ratio(coveredDocuments, documentReports.length),
      restrictedCoverageRatio: ratio(
        restrictedDocuments.filter((document) => document.coveredBy !== "none").length,
        restrictedDocuments.length
      ),
      teamCoverageRatio: ratio(
        teamDocuments.filter((document) => document.coveredBy !== "none").length,
        teamDocuments.length
      ),
      evalCaseCount: rows.length,
      expectedSourceCount: new Set(rows.flatMap((row) => row.expectedSources)).size,
      actualSourceCount: new Set(rows.flatMap((row) => row.actualSources)).size
    };
    const status: EvaluationCoverageReport["status"] =
      documentReports.length === 0 || rows.length === 0
        ? "missing_eval"
        : summary.uncoveredDocuments > 0 || summary.restrictedCoverageRatio < 1
          ? "gaps"
          : "healthy";
    const actionItems = buildCoverageActionItems({
      suiteName,
      summary,
      blindSpots
    });
    const hashBasis = {
      suiteName,
      runId,
      status,
      summary,
      documents: documentReports.map((document) => ({
        path: document.path,
        coveredBy: document.coveredBy,
        expectedCaseCount: document.expectedCaseCount,
        actualHitCount: document.actualHitCount,
        topSourceCount: document.topSourceCount,
        riskLevel: document.riskLevel
      })),
      blindSpots,
      actionItems
    };

    return {
      report: {
        schemaVersion: "opspilot.evaluation_coverage.v1",
        suiteName,
        runId,
        generatedAt: new Date().toISOString(),
        status,
        summary,
        documents: documentReports,
        blindSpots,
        actionItems,
        integrity: {
          reportHash: sha256(stableStringify(hashBasis)),
          hashAlgorithm: "sha256",
          includedFields: ["suiteName", "runId", "status", "summary", "documents", "blindSpots", "actionItems"]
        }
      }
    };
  }

  async retrieval(suiteName: string, questions?: EvalQuestion[]): Promise<{ report: RetrievalEvaluationReport }> {
    const evalQuestions = questions ?? (await loadEvalQuestionsFromEnv());
    const candidateWindow = Number(process.env.RETRIEVAL_EVAL_CANDIDATE_WINDOW ?? 30);
    const rows = [];
    for (const item of evalQuestions) {
      const [baseSearchResult, searchResult] = await Promise.all([
        this.search.searchWithAudit(item.question, item.actor, 10, { rerank: false }),
        this.search.searchWithAudit(item.question, item.actor, 10, { rerank: true, candidateWindow })
      ]);
      const baseRankedSources = uniqueRankedSources(baseSearchResult.results.map((result) => result.path));
      const baseFirstRelevantRank = firstRelevantSourceRank(item.expectedSources, baseRankedSources);
      const rankedSources = uniqueRankedSources(searchResult.results.map((result) => result.path));
      const firstRelevantRank = firstRelevantSourceRank(item.expectedSources, rankedSources);
      rows.push({
        id: item.id,
        question: item.question,
        expectedSources: item.expectedSources,
        baseRankedSources,
        baseFirstRelevantRank,
        baseReciprocalRank: baseFirstRelevantRank ? Number((1 / baseFirstRelevantRank).toFixed(3)) : 0,
        baseRecallAt1: rankWithin(baseFirstRelevantRank, 1),
        baseRecallAt3: rankWithin(baseFirstRelevantRank, 3),
        baseRecallAt5: rankWithin(baseFirstRelevantRank, 5),
        baseNdcgAt5: ndcgAtK(item.expectedSources, baseRankedSources, 5),
        rankedSources,
        firstRelevantRank,
        reciprocalRank: firstRelevantRank ? Number((1 / firstRelevantRank).toFixed(3)) : 0,
        recallAt1: rankWithin(firstRelevantRank, 1),
        recallAt3: rankWithin(firstRelevantRank, 3),
        recallAt5: rankWithin(firstRelevantRank, 5),
        ndcgAt5: ndcgAtK(item.expectedSources, rankedSources, 5),
        rankDelta:
          typeof baseFirstRelevantRank === "number" && typeof firstRelevantRank === "number"
            ? baseFirstRelevantRank - firstRelevantRank
            : null,
        permissionEnforcement: searchResult.permissionAudit.enforcement,
        deniedCandidateCount: searchResult.permissionAudit.deniedCandidateCount
      });
    }

    const baselineMetrics = retrievalMetrics(rows, "base");
    const metrics = retrievalMetrics(rows, "reranked");
    const reranking = {
      enabled: true,
      method: "local_bm25_keytoken_v1" as const,
      candidateWindow,
      changedTopSourceCount: rows.filter((row) => row.baseRankedSources[0] !== row.rankedSources[0]).length,
      deltas: {
        recallAt1: delta(metrics.recallAt1, baselineMetrics.recallAt1),
        recallAt3: delta(metrics.recallAt3, baselineMetrics.recallAt3),
        mrr: delta(metrics.mrr, baselineMetrics.mrr),
        ndcgAt5: delta(metrics.ndcgAt5, baselineMetrics.ndcgAt5)
      }
    };
    const thresholds = {
      recallAt3: readThreshold("EVAL_MIN_RETRIEVAL_RECALL_AT_3", 1),
      mrr: readThreshold("EVAL_MIN_RETRIEVAL_MRR", 0.8)
    };
    const gates = [
      {
        metric: "recallAt3" as const,
        score: metrics.recallAt3,
        threshold: thresholds.recallAt3,
        passed: metrics.recallAt3 >= thresholds.recallAt3
      },
      {
        metric: "mrr" as const,
        score: metrics.mrr,
        threshold: thresholds.mrr,
        passed: metrics.mrr >= thresholds.mrr
      }
    ];
    const status: RetrievalEvaluationReport["status"] = gates.every((gate) => gate.passed)
      ? "pass"
      : metrics.recallAt5 === 1
        ? "warn"
        : "fail";
    const actionItems = buildRetrievalActionItems({ suiteName, metrics, rows });
    const hashBasis = {
      suiteName,
      total: rows.length,
      status,
      metrics,
      baselineMetrics,
      reranking,
      gates,
      rows: rows.map((row) => ({
        id: row.id,
        expectedSources: row.expectedSources,
        baseRankedSources: row.baseRankedSources,
        rankedSources: row.rankedSources,
        baseFirstRelevantRank: row.baseFirstRelevantRank,
        firstRelevantRank: row.firstRelevantRank,
        rankDelta: row.rankDelta,
        ndcgAt5: row.ndcgAt5
      })),
      actionItems
    };

    return {
      report: {
        schemaVersion: "opspilot.retrieval_evaluation.v1",
        suiteName,
        generatedAt: new Date().toISOString(),
        total: rows.length,
        status,
        metrics,
        baselineMetrics,
        reranking,
        thresholds,
        gates,
        rows,
        actionItems,
        integrity: {
          reportHash: sha256(stableStringify(hashBasis)),
          hashAlgorithm: "sha256",
          includedFields: ["suiteName", "total", "status", "metrics", "baselineMetrics", "reranking", "gates", "rows", "actionItems"]
        }
      }
    };
  }

  async embeddingComparison(suiteName: string, questions?: EvalQuestion[]): Promise<{ report: EmbeddingComparisonReport }> {
    const evalQuestions = questions ?? (await loadEvalQuestionsFromEnv());
    const chunks = await this.loadEmbeddingComparisonChunks();
    const dimensions = this.embeddings.dimensions();
    const candidateProviderName = readEmbeddingCandidateProvider();
    const candidateModel =
      candidateProviderName === "transformers"
        ? (process.env.TRANSFORMERS_EMBEDDING_MODEL ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2")
        : (process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small");
    const localRows = await this.rankEmbeddingQuestions(evalQuestions, chunks, {
      provider: {
        embed: async (text: string) => this.embeddings.embedLocal(text)
      },
      providerLabel: "local_hash_embedding"
    });
    const localMetrics = embeddingComparisonMetrics(localRows);
    const openAiKey = process.env.OPENAI_API_KEY;
    let candidateRows: EmbeddingComparisonRankRow[] = [];
    let skippedReason: string | undefined;

    if (candidateProviderName === "transformers") {
      try {
        candidateRows = await this.rankEmbeddingQuestions(evalQuestions, chunks, {
          provider: new TransformersEmbeddingProvider({
            model: candidateModel,
            dimensions
          }),
          providerLabel: "transformers"
        });
      } catch (error) {
        skippedReason = error instanceof Error ? error.message : "Transformers embedding comparison failed";
      }
    } else if (openAiKey) {
      try {
        candidateRows = await this.rankEmbeddingQuestions(evalQuestions, chunks, {
          provider: new OpenAIEmbeddingProvider({
            apiKey: openAiKey,
            embeddingModel: candidateModel,
            embeddingDimensions: dimensions,
            fallbackToLocal: false
          }),
          providerLabel: "openai"
        });
      } catch (error) {
        skippedReason = error instanceof Error ? error.message : "OpenAI embedding comparison failed";
      }
    } else {
      skippedReason = "OPENAI_API_KEY is not set";
    }

    const candidateAvailable = candidateRows.length === localRows.length && candidateRows.length > 0;
    const candidateMetrics = candidateAvailable ? embeddingComparisonMetrics(candidateRows) : null;
    const rows = localRows.map((localRow) => {
      const candidateRow = candidateRows.find((row) => row.id === localRow.id);
      return {
        id: localRow.id,
        question: localRow.question,
        expectedSources: localRow.expectedSources,
        localRankedSources: localRow.rankedSources,
        localFirstRelevantRank: localRow.firstRelevantRank,
        localRecallAt3: localRow.recallAt3,
        localNdcgAt5: localRow.ndcgAt5,
        candidateRankedSources: candidateRow?.rankedSources ?? [],
        candidateFirstRelevantRank: candidateRow?.firstRelevantRank ?? null,
        candidateRecallAt3: candidateRow?.recallAt3 ?? null,
        candidateNdcgAt5: candidateRow?.ndcgAt5 ?? null,
        rankDelta:
          typeof localRow.firstRelevantRank === "number" && typeof candidateRow?.firstRelevantRank === "number"
            ? localRow.firstRelevantRank - candidateRow.firstRelevantRank
            : null
      };
    });
    const deltas = {
      recallAt1: candidateMetrics ? delta(candidateMetrics.recallAt1, localMetrics.recallAt1) : null,
      recallAt3: candidateMetrics ? delta(candidateMetrics.recallAt3, localMetrics.recallAt3) : null,
      mrr: candidateMetrics ? delta(candidateMetrics.mrr, localMetrics.mrr) : null,
      ndcgAt5: candidateMetrics ? delta(candidateMetrics.ndcgAt5, localMetrics.ndcgAt5) : null
    };
    const status: EmbeddingComparisonReport["status"] = !candidateAvailable
      ? "skipped"
      : (deltas.recallAt3 ?? 0) < 0 || (deltas.mrr ?? 0) < -0.05
        ? "fail"
        : (deltas.recallAt3 ?? 0) > 0 || (deltas.mrr ?? 0) > 0 || (deltas.ndcgAt5 ?? 0) > 0
          ? "pass"
          : "warn";
    const actionItems = buildEmbeddingComparisonActionItems({
      status,
      skippedReason,
      candidateProvider: candidateProviderName,
      candidateModel,
      localMetrics,
      candidateMetrics,
      deltas
    });
    const hashBasis = {
      suiteName,
      status,
      dimensions,
      baseline: localMetrics,
      candidate: {
        provider: candidateProviderName,
        model: candidateModel,
        available: candidateAvailable,
        metrics: candidateMetrics,
        deltas
      },
      rows: rows.map((row) => ({
        id: row.id,
        expectedSources: row.expectedSources,
        localRankedSources: row.localRankedSources,
        candidateRankedSources: row.candidateRankedSources,
        rankDelta: row.rankDelta
      })),
      actionItems
    };

    return {
      report: {
        schemaVersion: "opspilot.embedding_comparison.v1",
        suiteName,
        generatedAt: new Date().toISOString(),
        status,
        total: rows.length,
        dimensions,
        baseline: {
          provider: "local_hash_embedding",
          model: "fnv_token_bucket_64d",
          metrics: localMetrics
        },
        candidate: {
          provider: candidateProviderName,
          model: candidateModel,
          available: candidateAvailable,
          skippedReason,
          metrics: candidateMetrics,
          deltas
        },
        rows,
        actionItems,
        integrity: {
          reportHash: sha256(stableStringify(hashBasis)),
          hashAlgorithm: "sha256",
          includedFields: ["suiteName", "status", "dimensions", "baseline", "candidate", "rows", "actionItems"]
        }
      }
    };
  }

  private async loadSourceContents(chunkIds: string[]): Promise<string[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const rows = (await this.orm.em.fork().getConnection().execute(
      `
        select content
        from document_chunks
        where id in (${chunkIds.map(() => "?::uuid").join(", ")});
      `,
      chunkIds
    )) as Array<{ content: string }>;

    return rows.map((row) => row.content);
  }

  private async latestRunId(suiteName: string): Promise<string> {
    const [row] = (await this.orm.em.fork().getConnection().execute(
      `
        select details
        from evaluation_results
        where suite_name = ?
        order by created_at desc
        limit 1;
      `,
      [suiteName]
    )) as Array<{ details: EvaluationMetricDetails | string }>;

    return normalizeDetails(row?.details).runId ?? "unknown";
  }

  private async loadEvaluationDocuments(): Promise<EvaluationDocumentRow[]> {
    return (await this.orm.em.fork().getConnection().execute(
      `
        select path, title, visibility, team_slug, updated_at
        from documents
        order by visibility desc, path asc;
      `
    )) as EvaluationDocumentRow[];
  }

  private async loadEmbeddingComparisonChunks(): Promise<EmbeddingComparisonChunkRow[]> {
    return this.orm.em.fork().getConnection().execute<EmbeddingComparisonChunkRow[]>(
      `
        select
          c.id as "chunkId",
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          c.content
        from document_chunks c
        join documents d on d.id = c.document_id
        where not coalesce((c.metadata #>> '{security,promptInjectionRisk}')::boolean, false)
        order by d.path asc, c.chunk_index asc;
      `
    );
  }

  private async rankEmbeddingQuestions(
    questions: EvalQuestion[],
    chunks: EmbeddingComparisonChunkRow[],
    input: { provider: EmbeddingProvider; providerLabel: string }
  ): Promise<EmbeddingComparisonRankRow[]> {
    const embeddingCache = new Map<string, number[]>();
    const rows: EmbeddingComparisonRankRow[] = [];

    for (const question of questions) {
      const allowedChunks = chunks.filter((chunk) => this.authz.canAccessDocument(question.actor, chunk.visibility, chunk.teamSlug));
      const questionVector = await cachedEmbedding(embeddingCache, input.provider, `question:${input.providerLabel}:${question.question}`, question.question);
      const rankedChunks = [];

      for (const chunk of allowedChunks) {
        const chunkVector = await cachedEmbedding(
          embeddingCache,
          input.provider,
          `chunk:${input.providerLabel}:${chunk.chunkId}`,
          `${chunk.title}\n${chunk.content}`
        );
        rankedChunks.push({
          path: chunk.path,
          score: cosineSimilarity(questionVector, chunkVector)
        });
      }

      rankedChunks.sort((left, right) => right.score - left.score);
      const rankedSources = uniqueRankedSources(rankedChunks.map((chunk) => chunk.path)).slice(0, 10);
      const firstRelevantRank = firstRelevantSourceRank(question.expectedSources, rankedSources);
      rows.push({
        id: question.id,
        question: question.question,
        expectedSources: question.expectedSources,
        rankedSources,
        firstRelevantRank,
        reciprocalRank: firstRelevantRank ? Number((1 / firstRelevantRank).toFixed(3)) : 0,
        recallAt1: rankWithin(firstRelevantRank, 1),
        recallAt3: rankWithin(firstRelevantRank, 3),
        recallAt5: rankWithin(firstRelevantRank, 5),
        ndcgAt5: ndcgAtK(question.expectedSources, rankedSources, 5)
      });
    }

    return rows;
  }
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : Number((value / total).toFixed(3));
}

function itemMatchesTopSource(expectedSources: string[], actualSources: string[]): boolean {
  const topSource = actualSources[0];
  return Boolean(topSource && expectedSources.includes(topSource));
}

function evaluationThresholdsFromEnv(): EvaluationThresholds {
  return {
    sourceHitRate: readThreshold("EVAL_MIN_SOURCE_HIT_RATE", 1),
    topSourceAccuracy: readThreshold("EVAL_MIN_TOP_SOURCE_ACCURACY", 1),
    humanReviewAccuracy: readThreshold("EVAL_MIN_HUMAN_REVIEW_ACCURACY", 1),
    documentAgreementScore: readThreshold("EVAL_MIN_DOCUMENT_AGREEMENT_SCORE", 0.8),
    citationAccuracy: readThreshold("EVAL_MIN_CITATION_ACCURACY", 1)
  };
}

function buildEvaluationGates(metrics: EvaluationThresholds, thresholds: EvaluationThresholds): EvaluationGate[] {
  return (Object.keys(thresholds) as Array<keyof EvaluationThresholds>).map((metric) => ({
    metric,
    score: metrics[metric],
    threshold: thresholds[metric],
    passed: metrics[metric] >= thresholds[metric]
  }));
}

function readThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }

  return value;
}

function readEmbeddingCandidateProvider(): EmbeddingComparisonReport["candidate"]["provider"] {
  const raw = process.env.EMBEDDING_CANDIDATE_PROVIDER ?? "openai";
  if (raw === "openai" || raw === "transformers") {
    return raw;
  }

  throw new Error(`Unsupported EMBEDDING_CANDIDATE_PROVIDER: ${raw}`);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function averageNullable(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length === 0 ? null : average(numbers);
}

function delta(current: number, baseline: number): number {
  return Number((current - baseline).toFixed(3));
}

function retrievalMetrics(
  rows: RetrievalEvaluationReport["rows"],
  mode: "base" | "reranked"
): RetrievalEvaluationReport["metrics"] {
  if (mode === "base") {
    return {
      recallAt1: ratio(rows.filter((row) => row.baseRecallAt1).length, rows.length),
      recallAt3: ratio(rows.filter((row) => row.baseRecallAt3).length, rows.length),
      recallAt5: ratio(rows.filter((row) => row.baseRecallAt5).length, rows.length),
      mrr: average(rows.map((row) => row.baseReciprocalRank)),
      ndcgAt5: average(rows.map((row) => row.baseNdcgAt5)),
      averageFirstRelevantRank: averageNullable(rows.map((row) => row.baseFirstRelevantRank))
    };
  }

  return {
    recallAt1: ratio(rows.filter((row) => row.recallAt1).length, rows.length),
    recallAt3: ratio(rows.filter((row) => row.recallAt3).length, rows.length),
    recallAt5: ratio(rows.filter((row) => row.recallAt5).length, rows.length),
    mrr: average(rows.map((row) => row.reciprocalRank)),
    ndcgAt5: average(rows.map((row) => row.ndcgAt5)),
    averageFirstRelevantRank: averageNullable(rows.map((row) => row.firstRelevantRank))
  };
}

function embeddingComparisonMetrics(rows: EmbeddingComparisonRankRow[]): RetrievalMetricSummary {
  return {
    recallAt1: ratio(rows.filter((row) => row.recallAt1).length, rows.length),
    recallAt3: ratio(rows.filter((row) => row.recallAt3).length, rows.length),
    recallAt5: ratio(rows.filter((row) => row.recallAt5).length, rows.length),
    mrr: average(rows.map((row) => row.reciprocalRank)),
    ndcgAt5: average(rows.map((row) => row.ndcgAt5)),
    averageFirstRelevantRank: averageNullable(rows.map((row) => row.firstRelevantRank))
  };
}

async function cachedEmbedding(cache: Map<string, number[]>, provider: EmbeddingProvider, key: string, text: string): Promise<number[]> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const embedding = await provider.embed(text);
  cache.set(key, embedding);
  return embedding;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < dimensions; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return Number((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))).toFixed(6));
}

async function loadEvalQuestionsFromEnv(): Promise<EvalQuestion[]> {
  const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
  return JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
}

function resolveEvalPath(evalPath: string): string {
  return isAbsolute(evalPath) ? evalPath : resolve(join(process.cwd(), evalPath));
}

function uniqueRankedSources(paths: string[]): string[] {
  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      ranked.push(path);
    }
  }
  return ranked;
}

function firstRelevantSourceRank(expectedSources: string[], rankedSources: string[]): number | null {
  const rank = rankedSources.findIndex((source) => expectedSources.includes(source));
  return rank >= 0 ? rank + 1 : null;
}

function rankWithin(rank: number | null, k: number): boolean {
  return typeof rank === "number" && rank <= k;
}

function ndcgAtK(expectedSources: string[], rankedSources: string[], k: number): number {
  const gains = rankedSources.slice(0, k).map((source, index) => {
    const relevance = expectedSources.includes(source) ? 1 : 0;
    return relevance / Math.log2(index + 2);
  });
  const dcg = gains.reduce((sum, value) => sum + value, 0);
  const idealRelevantCount = Math.min(expectedSources.length, k);
  const idealDcg = Array.from({ length: idealRelevantCount }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
  return idealDcg === 0 ? 0 : Number((dcg / idealDcg).toFixed(3));
}

function buildRetrievalActionItems(input: {
  suiteName: string;
  metrics: RetrievalEvaluationReport["metrics"];
  rows: RetrievalEvaluationReport["rows"];
}): RetrievalEvaluationReport["actionItems"] {
  const missed = input.rows.filter((row) => !row.recallAt5);
  const lowRanked = input.rows.filter((row) => row.recallAt5 && !row.recallAt3);
  const items: RetrievalEvaluationReport["actionItems"] = [];

  if (missed.length > 0) {
    items.push({
      id: "retrieval-missed-expected-source",
      priority: "P0",
      owner: "retrieval",
      title: "기대 문서가 top-5 검색 후보에 없습니다.",
      evidence: `${missed.length}개 케이스가 recall@5에 실패했습니다: ${missed.map((row) => row.id).join(", ")}`,
      command: `pnpm retrieval-eval:smoke`
    });
  }

  if (lowRanked.length > 0 || input.metrics.mrr < 0.8) {
    items.push({
      id: "retrieval-ranking-depth",
      priority: "P1",
      owner: "reranking",
      title: "기대 문서가 검색되지만 상위 랭킹이 약합니다.",
      evidence: `MRR ${input.metrics.mrr}, recall@3 ${input.metrics.recallAt3}. reranking 전후 수치 비교가 필요합니다.`,
      command: `curl http://localhost:3000/evaluations/retrieval?suiteName=${input.suiteName}`
    });
  }

  if (items.length === 0) {
    items.push({
      id: "retrieval-baseline-healthy",
      priority: "P2",
      owner: "embedding",
      title: "현재 seed 평가셋의 retrieval baseline은 기준을 통과했습니다.",
      evidence: `recall@3 ${input.metrics.recallAt3}, MRR ${input.metrics.mrr}, nDCG@5 ${input.metrics.ndcgAt5}. 다음 단계는 실제 임베딩 모델과 local hash embedding 비교입니다.`,
      command: "EMBEDDING_PROVIDER=openai OPENAI_API_KEY=... pnpm retrieval-eval:smoke"
    });
  }

  return items;
}

function buildEmbeddingComparisonActionItems(input: {
  status: EmbeddingComparisonReport["status"];
  skippedReason?: string;
  candidateProvider: EmbeddingComparisonReport["candidate"]["provider"];
  candidateModel: string;
  localMetrics: RetrievalMetricSummary;
  candidateMetrics: RetrievalMetricSummary | null;
  deltas: EmbeddingComparisonReport["candidate"]["deltas"];
}): EmbeddingComparisonReport["actionItems"] {
  const rerunCommand =
    input.candidateProvider === "transformers"
      ? "EMBEDDING_CANDIDATE_PROVIDER=transformers pnpm embedding-eval:smoke"
      : "EMBEDDING_CANDIDATE_PROVIDER=openai OPENAI_API_KEY=... pnpm embedding-eval:smoke";
  const hardCommand =
    input.candidateProvider === "transformers"
      ? "EMBEDDING_CANDIDATE_PROVIDER=transformers pnpm embedding-hard:smoke"
      : "EMBEDDING_CANDIDATE_PROVIDER=openai OPENAI_API_KEY=... pnpm embedding-hard:smoke";

  if (input.status === "skipped") {
    const noKeyFallbackCommand =
      input.candidateProvider === "openai" && input.skippedReason === "OPENAI_API_KEY is not set"
        ? "EMBEDDING_CANDIDATE_PROVIDER=transformers pnpm embedding-hard:smoke"
        : hardCommand;

    return [
      {
        id: "run-real-embedding-comparison",
        priority: "P1",
        owner: "embedding",
        title: "실제 임베딩 비교가 아직 실행되지 않았습니다.",
        evidence: input.skippedReason ?? `${input.candidateProvider} embedding provider was unavailable.`,
        command: noKeyFallbackCommand
      }
    ];
  }

  if (input.status === "fail") {
    return [
      {
        id: "embedding-regression",
        priority: "P0",
        owner: "embedding",
        title: "실제 임베딩 모델이 local baseline보다 낮은 검색 품질을 보였습니다.",
        evidence: `local MRR ${input.localMetrics.mrr}, ${input.candidateProvider} ${input.candidateModel} MRR ${input.candidateMetrics?.mrr ?? 0}, delta ${input.deltas.mrr ?? 0}`,
        command: rerunCommand
      }
    ];
  }

  if (input.status === "warn") {
    return [
      {
        id: "add-hard-semantic-eval-set",
        priority: "P1",
        owner: "evaluation",
        title: "현재 평가셋에서는 실제 임베딩 개선폭이 뚜렷하지 않습니다.",
        evidence: `recall@3 delta ${input.deltas.recallAt3 ?? 0}, MRR delta ${input.deltas.mrr ?? 0}, nDCG@5 delta ${input.deltas.ndcgAt5 ?? 0}`,
        command: hardCommand
      }
    ];
  }

  return [
    {
      id: "real-embedding-outperforms-local",
      priority: "P2",
      owner: "embedding",
      title: "실제 임베딩 모델 비교가 통과했습니다.",
      evidence: `recall@3 delta ${input.deltas.recallAt3 ?? 0}, MRR delta ${input.deltas.mrr ?? 0}, nDCG@5 delta ${input.deltas.ndcgAt5 ?? 0}`,
      command: "curl http://localhost:3000/evaluations/embedding-comparison"
    }
  ];
}

function answerCitesReturnedSource(answer: string, sources: Array<{ title: string; path: string }>): boolean {
  const normalizedAnswer = normalizeCitationText(answer);
  return sources.some((source) => {
    const title = normalizeCitationText(source.title);
    const path = normalizeCitationText(source.path);
    return (title.length > 0 && normalizedAnswer.includes(title)) || (path.length > 0 && normalizedAnswer.includes(path));
  });
}

function normalizeCitationText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildHistoryItem(suiteName: string, runId: string, rows: EvaluationMetricRow[]): EvaluationHistoryItem {
  const newestRow = getNewestRow(rows);
  const details = normalizeDetails(newestRow.details);
  const metrics = details.metrics ?? metricsFromRows(rows) ?? metricsFromGates(details.gates) ?? emptyMetrics();
  const thresholds = details.thresholds ?? evaluationThresholdsFromEnv();
  const gates = details.gates ?? buildEvaluationGates(metrics, thresholds);

  return {
    runId,
    suiteName,
    createdAt: new Date(newestRow.created_at).toISOString(),
    total: details.total ?? details.rows?.length ?? 0,
    passed: details.passed ?? gates.every((gate) => gate.passed),
    metrics,
    thresholds,
    gates,
    deltas: {}
  };
}

function groupEvaluationRows(rows: EvaluationMetricRow[]): Map<string, EvaluationMetricRow[]> {
  const grouped = new Map<string, EvaluationMetricRow[]>();
  for (const row of rows) {
    row.details = normalizeDetails(row.details);
    const runKey = row.details.runId ?? new Date(row.created_at).toISOString();
    grouped.set(runKey, [...(grouped.get(runKey) ?? []), row]);
  }

  return grouped;
}

function getNewestRow(rows: EvaluationMetricRow[]): EvaluationMetricRow {
  return rows.reduce((latest, row) => (new Date(row.created_at) > new Date(latest.created_at) ? row : latest), rows[0]);
}

function getNewestTimestamp(rows: EvaluationMetricRow[]): number {
  return new Date(getNewestRow(rows).created_at).getTime();
}

function normalizeDetails(details: EvaluationMetricDetails | string | null | undefined): EvaluationMetricDetails {
  if (!details) {
    return {};
  }

  if (typeof details === "string") {
    return JSON.parse(details) as EvaluationMetricDetails;
  }

  return details;
}

function metricsFromRows(rows: EvaluationMetricRow[]): EvaluationMetrics | null {
  const metrics = emptyMetrics();
  let found = 0;
  for (const row of rows) {
    const metricName = METRIC_NAMES[row.metric_name as StoredMetricName];
    if (metricName) {
      metrics[metricName] = Number(row.score);
      found += 1;
    }
  }

  return found > 0 ? metrics : null;
}

function metricsFromGates(gates?: EvaluationGate[]): EvaluationMetrics | null {
  if (!gates || gates.length === 0) {
    return null;
  }

  const metrics = emptyMetrics();
  for (const gate of gates) {
    metrics[gate.metric] = gate.score;
  }

  return metrics;
}

function emptyMetrics(): EvaluationMetrics {
  return {
    sourceHitRate: 0,
    topSourceAccuracy: 0,
    humanReviewAccuracy: 0,
    documentAgreementScore: 0,
    citationAccuracy: 0
  };
}

function buildMetricDeltas(
  current: EvaluationMetrics,
  previous?: EvaluationMetrics
): Partial<Record<keyof EvaluationMetrics, number | null>> {
  return (Object.keys(current) as Array<keyof EvaluationMetrics>).reduce<Partial<Record<keyof EvaluationMetrics, number | null>>>(
    (deltas, metric) => ({
      ...deltas,
      [metric]: previous ? Number((current[metric] - previous[metric]).toFixed(3)) : null
    }),
    {}
  );
}

function buildRegressionMetricDeltas(
  current: EvaluationHistoryItem,
  previous: EvaluationHistoryItem | null
): EvaluationRegressionReport["metricDeltas"] {
  return (Object.keys(current.metrics) as Array<keyof EvaluationMetrics>).map((metric) => {
    const currentValue = current.metrics[metric];
    const previousValue = previous?.metrics[metric] ?? null;
    const delta = previousValue === null ? null : Number((currentValue - previousValue).toFixed(3));
    const gate = current.gates.find((item) => item.metric === metric);
    const status: EvaluationRegressionReport["metricDeltas"][number]["status"] =
      delta === null ? "new" : delta < 0 ? "degraded" : delta > 0 ? "improved" : "stable";

    return {
      metric,
      current: currentValue,
      previous: previousValue,
      delta,
      status,
      threshold: gate?.threshold ?? current.thresholds[metric],
      gatePassed: gate?.passed ?? currentValue >= current.thresholds[metric]
    };
  });
}

function buildRegressionReleaseDecision(
  status: EvaluationRegressionReport["status"],
  summary: EvaluationRegressionReport["summary"]
): EvaluationRegressionReport["releaseDecision"] {
  if (status === "block") {
    return {
      label: "배포 차단",
      reason: `실패 게이트 ${summary.failedGateCount}개, 고위험 케이스 ${summary.highRiskCaseCount}개가 남아 있습니다.`,
      requiredAction: "실패 케이스를 수정하고 평가를 재실행한 뒤 회귀 리포트 해시를 갱신하세요."
    };
  }

  if (status === "watch") {
    return {
      label: "관찰 후 배포",
      reason: `품질 게이트는 통과했지만 ${summary.degradedMetricCount}개 메트릭이 직전 실행보다 하락했습니다.`,
      requiredAction: "하락한 메트릭을 릴리즈 노트에 남기고 다음 평가에서 회복되는지 확인하세요."
    };
  }

  return {
    label: "배포 가능",
    reason: "품질 게이트를 통과했고 직전 실행 대비 회귀가 없습니다.",
    requiredAction: "현재 평가 run id와 리포트 해시를 릴리즈 증거로 기록하세요."
  };
}

function buildRegressionActionItems(input: {
  failedGates: EvaluationGate[];
  highRiskCases: EvaluationRegressionReport["highRiskCases"];
  metricDeltas: EvaluationRegressionReport["metricDeltas"];
  suiteName: string;
}): EvaluationRegressionReport["actionItems"] {
  const items: EvaluationRegressionReport["actionItems"] = [];

  for (const gate of input.failedGates) {
    items.push({
      id: `gate-${gate.metric}`,
      priority: "P0",
      owner: ownerForMetric(gate.metric),
      title: `${formatMetricName(gate.metric)} 게이트 복구`,
      evidence: `${formatMetricName(gate.metric)} ${formatPercent(gate.score)} < 기준 ${formatPercent(gate.threshold)}`,
      command: "pnpm eval"
    });
  }

  for (const item of input.highRiskCases.slice(0, 5)) {
    items.push({
      id: `case-${item.id}`,
      priority: item.failedChecks.includes("source_hit") ? "P0" : "P1",
      owner: item.failedChecks.includes("human_review") ? "security" : item.failedChecks.includes("citation") ? "prompt" : "retrieval",
      title: `${item.id} 케이스 재현 및 수정`,
      evidence: `실패 검사 ${item.failedChecks.join(", ") || "없음"} · 1순위 ${item.topSource ?? "출처 없음"}`,
      command: "pnpm eval:cases-smoke"
    });
  }

  for (const metric of input.metricDeltas.filter((item) => item.status === "degraded").slice(0, 3)) {
    items.push({
      id: `delta-${metric.metric}`,
      priority: "P2",
      owner: ownerForMetric(metric.metric),
      title: `${formatMetricName(metric.metric)} 회귀 관찰`,
      evidence: `직전 실행 대비 ${formatDelta(metric.delta)} 하락했습니다.`,
      command: `curl http://localhost:3000/evaluations/regression?suiteName=${input.suiteName}`
    });
  }

  if (items.length === 0) {
    items.push({
      id: "record-release-evidence",
      priority: "P2",
      owner: "evaluation",
      title: "릴리즈 증거 기록",
      evidence: "평가 게이트와 회귀 비교가 모두 통과했습니다.",
      command: `curl http://localhost:3000/evaluations/regression?suiteName=${input.suiteName}`
    });
  }

  return dedupeActionItems(items).slice(0, 8);
}

function ownerForMetric(metric: keyof EvaluationMetrics): EvaluationRegressionReport["actionItems"][number]["owner"] {
  const owners: Record<keyof EvaluationMetrics, EvaluationRegressionReport["actionItems"][number]["owner"]> = {
    sourceHitRate: "retrieval",
    topSourceAccuracy: "retrieval",
    humanReviewAccuracy: "security",
    documentAgreementScore: "prompt",
    citationAccuracy: "prompt"
  };

  return owners[metric];
}

function formatMetricName(metric: keyof EvaluationMetrics): string {
  const labels: Record<keyof EvaluationMetrics, string> = {
    sourceHitRate: "출처 적중률",
    topSourceAccuracy: "1순위 출처 정확도",
    humanReviewAccuracy: "사람 검토 경계",
    documentAgreementScore: "문서 일치율",
    citationAccuracy: "출처 인용률"
  };

  return labels[metric];
}

function formatDelta(value: number | null): string {
  return value === null ? "신규" : `${Math.round(value * 100)}%p`;
}

function dedupeActionItems(items: EvaluationRegressionReport["actionItems"]): EvaluationRegressionReport["actionItems"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function buildEvaluationCase(row: EvalReport["rows"][number], thresholds: EvaluationThresholds): EvaluationCaseDetail {
  const restrictedExpected = row.expectedSources.some((source) => source.includes("restricted/"));
  const topSource = row.actualSources[0] ?? null;
  const checks: EvaluationCaseDetail["checks"] = [
    {
      id: "source_hit",
      label: "기대 출처 적중",
      status: row.hit ? "pass" : "fail",
      evidence: row.hit
        ? "반환 출처에 기대 문서가 포함됐습니다."
        : `기대 출처 ${row.expectedSources.join(", ")}를 찾지 못했습니다.`
    },
    {
      id: "top_source",
      label: "1순위 출처 정확도",
      status: topSource && row.expectedSources.includes(topSource) ? "pass" : row.hit ? "warn" : "fail",
      evidence: topSource
        ? `1순위 출처는 ${topSource}입니다.`
        : "반환된 출처가 없습니다."
    },
    {
      id: "human_review",
      label: "사람 검토 경계",
      status: restrictedExpected ? (row.needsHumanReview ? "pass" : "fail") : "pass",
      evidence: restrictedExpected
        ? row.needsHumanReview
          ? "제한 문서 기대 케이스에서 사람 검토가 켜졌습니다."
          : "제한 문서 기대 케이스인데 사람 검토가 켜지지 않았습니다."
        : row.needsHumanReview
          ? "제한 문서 기대 케이스가 아니므로 사람 검토 여부는 실패 조건이 아닙니다."
          : "추가 사람 검토가 필요하지 않습니다."
    },
    {
      id: "document_agreement",
      label: "문서 일치율",
      status: row.documentAgreement >= thresholds.documentAgreementScore ? "pass" : row.documentAgreement >= thresholds.documentAgreementScore * 0.8 ? "warn" : "fail",
      metric: row.documentAgreement,
      threshold: thresholds.documentAgreementScore,
      evidence: `답변과 근거 문서의 토큰 일치율은 ${formatPercent(row.documentAgreement)}입니다.`
    },
    {
      id: "citation",
      label: "출처 인용",
      status: row.citationPresent ? "pass" : "fail",
      evidence: row.citationPresent ? "답변 본문이 반환 출처를 직접 인용합니다." : "답변 본문에서 반환 출처 인용을 찾지 못했습니다."
    }
  ];
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;

  return {
    id: row.id,
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass",
    riskLevel: failCount >= 2 || !row.hit ? "high" : failCount === 1 || warnCount > 0 ? "medium" : "low",
    expectedSources: row.expectedSources,
    actualSources: row.actualSources,
    topSource,
    confidence: row.confidence,
    documentAgreement: row.documentAgreement,
    needsHumanReview: row.needsHumanReview,
    citationPresent: row.citationPresent,
    checks,
    recommendations: buildCaseRecommendations(row, checks)
  };
}

function buildCaseRecommendations(row: EvalReport["rows"][number], checks: EvaluationCaseDetail["checks"]): string[] {
  const recommendations = checks.flatMap((check) => {
    if (check.status === "pass") {
      return [];
    }
    if (check.id === "source_hit") {
      return ["기대 문서의 제목, 별칭, 운영 키워드를 보강하거나 청킹 결과를 확인하세요."];
    }
    if (check.id === "top_source") {
      return ["검색 랭킹 가중치와 문서별 중복 청크를 점검해 기대 문서가 1순위로 오도록 조정하세요."];
    }
    if (check.id === "human_review") {
      return ["제한 문서 또는 민감 작업 질문의 검토 사유와 승인 경계 조건을 확인하세요."];
    }
    if (check.id === "document_agreement") {
      return ["답변 템플릿이 근거 문서 밖 표현을 과하게 만들지 않는지 확인하고 근거 스니펫을 늘리세요."];
    }
    if (check.id === "citation") {
      return ["답변 생성 템플릿에 출처 제목 또는 경로를 명시적으로 포함시키세요."];
    }
    return [];
  });

  return [...new Set(recommendations)].slice(0, 4);
}

function buildCoverageDocuments(
  documents: EvaluationDocumentRow[],
  rows: EvalReport["rows"]
): EvaluationCoverageReport["documents"] {
  return documents.map((document) => {
    const expectedRows = rows.filter((row) => row.expectedSources.includes(document.path));
    const actualRows = rows.filter((row) => row.actualSources.includes(document.path));
    const topSourceCount = rows.filter((row) => row.actualSources[0] === document.path).length;
    const agreements = rows
      .filter((row) => row.expectedSources.includes(document.path) || row.actualSources.includes(document.path))
      .map((row) => row.documentAgreement);
    const coveredBy =
      expectedRows.length > 0 && actualRows.length > 0
        ? ("both" as const)
        : expectedRows.length > 0
          ? ("expected" as const)
          : actualRows.length > 0
            ? ("actual" as const)
            : ("none" as const);
    const riskLevel = coverageRiskLevel({
      visibility: document.visibility,
      coveredBy,
      expectedCaseCount: expectedRows.length,
      actualHitCount: actualRows.length
    });

    return {
      path: document.path,
      title: document.title,
      visibility: document.visibility,
      teamSlug: document.team_slug ?? null,
      updatedAt: toIsoString(document.updated_at),
      coveredBy,
      expectedCaseCount: expectedRows.length,
      actualHitCount: actualRows.length,
      topSourceCount,
      averageDocumentAgreement: average(agreements),
      riskLevel,
      recommendations: buildCoverageRecommendations({
        path: document.path,
        visibility: document.visibility,
        coveredBy,
        expectedCaseCount: expectedRows.length,
        actualHitCount: actualRows.length,
        topSourceCount
      })
    };
  });
}

function coverageRiskLevel(input: {
  visibility: string;
  coveredBy: EvaluationCoverageReport["documents"][number]["coveredBy"];
  expectedCaseCount: number;
  actualHitCount: number;
}): EvaluationCoverageReport["documents"][number]["riskLevel"] {
  if (input.coveredBy === "none") {
    return input.visibility === "restricted" || input.visibility === "team" ? "high" : "medium";
  }
  if (input.expectedCaseCount === 0 && input.actualHitCount > 0) {
    return "medium";
  }
  return "low";
}

function coverageRiskRank(riskLevel: EvaluationCoverageReport["documents"][number]["riskLevel"]): number {
  const ranks: Record<EvaluationCoverageReport["documents"][number]["riskLevel"], number> = {
    low: 1,
    medium: 2,
    high: 3
  };
  return ranks[riskLevel];
}

function buildCoverageRecommendations(input: {
  path: string;
  visibility: string;
  coveredBy: EvaluationCoverageReport["documents"][number]["coveredBy"];
  expectedCaseCount: number;
  actualHitCount: number;
  topSourceCount: number;
}): string[] {
  const recommendations: string[] = [];
  if (input.coveredBy === "none") {
    recommendations.push("이 문서를 기대 출처로 하는 평가 질문을 추가하세요.");
  }
  if (input.coveredBy === "actual") {
    recommendations.push("검색 결과에는 등장했지만 기대 출처로 검증되지 않았습니다. golden question에 명시하세요.");
  }
  if ((input.visibility === "restricted" || input.visibility === "team") && input.expectedCaseCount === 0) {
    recommendations.push("권한 경계와 사람 검토 기대값을 포함한 보안 평가 케이스를 추가하세요.");
  }
  if (input.actualHitCount > 0 && input.topSourceCount === 0) {
    recommendations.push("문서가 검색 후보에는 잡히지만 1순위가 아닙니다. 제목/별칭/청킹을 점검하세요.");
  }
  if (recommendations.length === 0) {
    recommendations.push("기대 출처와 실제 검색 출처가 최신 평가에서 검증됐습니다.");
  }
  return recommendations.slice(0, 3);
}

function buildSuggestedCoverageQuestion(document: EvaluationCoverageReport["documents"][number]): string {
  if (document.visibility === "restricted") {
    return `${document.title} 문서 기준으로 민감 작업을 직접 실행해도 되는지 설명해줘`;
  }
  if (document.visibility === "team") {
    return `${document.title} 문서 기준으로 온콜이 확인해야 할 운영 절차를 알려줘`;
  }
  return `${document.title} 문서의 핵심 정책을 근거와 함께 알려줘`;
}

function buildCoverageActionItems(input: {
  suiteName: string;
  summary: EvaluationCoverageReport["summary"];
  blindSpots: EvaluationCoverageReport["blindSpots"];
}): EvaluationCoverageReport["actionItems"] {
  const items: EvaluationCoverageReport["actionItems"] = [];
  if (input.summary.restrictedCoverageRatio < 1) {
    items.push({
      id: "cover-restricted-documents",
      priority: "P0",
      owner: "security",
      title: "제한 문서 평가 커버리지 보강",
      evidence: `제한 문서 커버리지가 ${formatPercent(input.summary.restrictedCoverageRatio)}입니다.`,
      command: "pnpm eval"
    });
  }
  if (input.summary.coverageRatio < 1) {
    items.push({
      id: "add-golden-questions",
      priority: "P1",
      owner: "evaluation",
      title: "미검증 문서 golden question 추가",
      evidence: `전체 문서 ${input.summary.totalDocuments}개 중 ${input.summary.uncoveredDocuments}개가 최신 평가에 포함되지 않았습니다.`,
      command: `curl http://localhost:3000/evaluations/coverage?suiteName=${input.suiteName}`
    });
  }
  for (const blindSpot of input.blindSpots.slice(0, 3)) {
    items.push({
      id: `blind-spot-${sha256(blindSpot.path).slice(0, 10)}`,
      priority: blindSpot.riskLevel === "high" ? "P1" : "P2",
      owner: blindSpot.visibility === "restricted" ? "security" : "retrieval",
      title: `${blindSpot.title} 평가 질문 추가`,
      evidence: blindSpot.reason,
      command: `# ${blindSpot.suggestedQuestion}`
    });
  }
  if (items.length === 0) {
    items.push({
      id: "coverage-healthy",
      priority: "P2",
      owner: "evaluation",
      title: "평가 커버리지 증거 기록",
      evidence: "모든 문서가 최신 평가의 기대 또는 실제 출처에 포함됐습니다.",
      command: `curl http://localhost:3000/evaluations/coverage?suiteName=${input.suiteName}`
    });
  }
  return items.slice(0, 6);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
