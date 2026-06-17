import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { AuthzService } from "../authz/authz.service";
import { ToolCallStatus } from "../database/entities/types";
import { RequestContext } from "../shared/request-context";
import { PermissionBoundaryAudit, SearchResult, SearchService } from "./search.service";
import { RunbookChecklist, RunbookChecklistService } from "./runbook-checklist.service";

export type IncidentResponsePlan = {
  planId: string;
  generatedAt: string;
  incident: string;
  severity: "sev1" | "sev2" | "sev3";
  confidence: number;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  permissionAudit: PermissionBoundaryAudit;
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
      status: ToolCallStatus;
    }>;
    guardrails: string[];
  };
};

@Injectable()
export class IncidentResponsePlanService {
  constructor(
    private readonly orm: MikroORM,
    private readonly searchService: SearchService,
    private readonly authz: AuthzService,
    private readonly runbookChecklist: RunbookChecklistService
  ) {}

  async create(incident: string, context: RequestContext, limit = 5): Promise<IncidentResponsePlan> {
    const safeLimit = Math.max(1, Math.min(limit, 10));
    const em = this.orm.em.fork();
    const connection = em.getConnection();
    const [questionRow] = await connection.execute<{ id: string }[]>(
      "insert into questions (text, channel, actor) values (?, ?, ?::jsonb) returning id",
      [incident, "incident_plan", JSON.stringify(context)]
    );
    const { results, permissionAudit } = await this.searchService.searchWithAudit(incident, context, safeLimit);
    const sources = prioritizeIncidentSources(incident, results);
    const checklist = this.runbookChecklist.create(`${incident} 체크리스트`, sources);
    const approvalGates = buildApprovalGates(incident, sources, this.authz.isSensitiveAction(incident));
    const severity = inferSeverity(incident, sources);
    const confidence = calculatePlanConfidence(sources, checklist);
    const phases = buildPhases(incident, sources, checklist, approvalGates);
    const communications = buildCommunications(incident, sources, severity);
    const verification = buildVerification(sources, checklist);
    const status = sources.length === 0 ? "blocked" : approvalGates.length > 0 || confidence < 0.35 ? "needs_review" : "ready";
    const planId = `plan_${questionRow.id}`;

    await connection.execute(
      `
        insert into tool_call_logs (question_id, tool_name, input, output, status)
        values (?::uuid, 'search_documents', ?::jsonb, ?::jsonb, ?);
      `,
      [
        questionRow.id,
        JSON.stringify({ incident, limit: safeLimit, actor: context }),
        JSON.stringify({ sourceCount: sources.length, paths: sources.map((source) => source.path), permissionAudit }),
        ToolCallStatus.Allowed
      ]
    );

    if (checklist) {
      await connection.execute(
        `
          insert into tool_call_logs (question_id, tool_name, input, output, status)
          values (?::uuid, 'create_runbook_checklist', ?::jsonb, ?::jsonb, ?);
        `,
        [
          questionRow.id,
          JSON.stringify({ incident, sourcePath: checklist.path }),
          JSON.stringify({ title: checklist.title, itemCount: checklist.items.length, items: checklist.items }),
          ToolCallStatus.Allowed
        ]
      );
    }

    await connection.execute(
      `
        insert into tool_call_logs (question_id, tool_name, input, output, status)
        values (?::uuid, 'create_incident_response_plan', ?::jsonb, ?::jsonb, ?);
      `,
      [
        questionRow.id,
        JSON.stringify({ incident, severity, sourceCount: sources.length }),
        JSON.stringify({
          planId,
          status,
          phaseCount: phases.length,
          approvalGateCount: approvalGates.length,
          communicationCount: communications.length,
          verificationCount: verification.length
        }),
        ToolCallStatus.Allowed
      ]
    );

    return {
      planId,
      generatedAt: new Date().toISOString(),
      incident,
      severity,
      confidence,
      status,
      summary: summarizePlan(incident, severity, sources, approvalGates),
      permissionAudit,
      sources: sources.map((source, index) => ({
        rank: index + 1,
        title: source.title,
        path: source.path,
        visibility: source.visibility,
        teamSlug: source.teamSlug,
        score: Number(source.score.toFixed(6))
      })),
      runbook: checklist
        ? { matched: true, title: checklist.title, path: checklist.path, itemCount: checklist.items.length }
        : { matched: false, itemCount: 0 },
      phases,
      approvalGates,
      communications,
      verification,
      audit: {
        persistedQuestionId: questionRow.id,
        toolCalls: [
          { toolName: "search_documents", status: ToolCallStatus.Allowed },
          ...(checklist ? [{ toolName: "create_runbook_checklist" as const, status: ToolCallStatus.Allowed }] : []),
          { toolName: "create_incident_response_plan", status: ToolCallStatus.Allowed }
        ],
        guardrails: [
          "권한 없는 문서는 검색 컨텍스트 생성 전에 제외됩니다.",
          "프롬프트 주입 위험 청크는 검색 후보에서 제외됩니다.",
          "민감 작업은 자동 실행하지 않고 사람 승인 경계로 분리됩니다."
        ]
      }
    };
  }
}

function inferSeverity(incident: string, sources: SearchResult[]): IncidentResponsePlan["severity"] {
  const text = `${incident} ${sources.map((source) => source.content).join(" ")}`.toLowerCase();
  if (/critical|sev1|고객\s*영향|customer-impacting|production|prod\s*db|85 percent|dlq count is above 100/.test(text)) {
    return "sev1";
  }
  if (/incident|rollback|pause|30 minutes|30분|지연|장애|spike|memory pressure|dlq/.test(text)) {
    return "sev2";
  }
  return "sev3";
}

function prioritizeIncidentSources(incident: string, sources: SearchResult[]): SearchResult[] {
  const terms = extractIncidentTerms(incident);
  return [...sources].sort((a, b) => scoreIncidentSource(b, terms) - scoreIncidentSource(a, terms));
}

function scoreIncidentSource(source: SearchResult, terms: string[]): number {
  const text = `${source.title} ${source.path} ${source.content}`.toLowerCase();
  const matchedTerms = terms.filter((term) => text.includes(term.toLowerCase())).length;
  const runbookBoost = /runbook|런북|incident|장애/.test(text) ? 0.35 : 0;
  const operationalBoost = /settlement|redis|worker|dlq|queue|batch|정산|배치/.test(text) ? 0.25 : 0;
  const ownedKnowledgeBoost = source.path.startsWith("team/") || source.path.startsWith("restricted/") ? 0.45 : 0;
  const githubDocsPenalty = source.path.startsWith("github/") ? -0.2 : 0;
  return source.score + matchedTerms * 0.12 + runbookBoost + operationalBoost + ownedKnowledgeBoost + githubDocsPenalty;
}

function extractIncidentTerms(incident: string): string[] {
  return [
    ...new Set(
      incident
        .toLowerCase()
        .replace(/[^\p{L}\p{N}._-]+/gu, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
  ].slice(0, 12);
}

function calculatePlanConfidence(sources: SearchResult[], checklist: RunbookChecklist | null): number {
  if (sources.length === 0) {
    return 0;
  }
  const topScore = Math.max(...sources.map((source) => source.score));
  const sourceBoost = Math.min(0.2, sources.length * 0.03);
  const checklistBoost = checklist ? 0.18 : 0;
  return Number(Math.min(0.98, Math.max(0.2, topScore + sourceBoost + checklistBoost)).toFixed(3));
}

function buildPhases(
  incident: string,
  sources: SearchResult[],
  checklist: RunbookChecklist | null,
  approvalGates: IncidentResponsePlan["approvalGates"]
): IncidentResponsePlan["phases"] {
  const runbookSteps = checklist?.items.length ? checklist.items : extractOperationalSteps(sources);
  const topSource = sources[0];
  const triageSteps = runbookSteps.slice(0, 3).map((step, index) =>
    buildStep(index + 1, step, checklist?.path ?? topSource?.path, approvalGates)
  );
  const mitigationSteps = runbookSteps.slice(3, 6).map((step, index) =>
    buildStep(index + 1, step, checklist?.path ?? topSource?.path, approvalGates)
  );

  return [
    {
      id: "triage",
      title: "상황 파악",
      objective: "영향 범위와 원인을 먼저 좁혀 잘못된 자동 조치를 막습니다.",
      steps: ensureSteps(triageSteps, [
        buildStep(1, "가장 관련도 높은 운영 문서와 최근 증상을 대조합니다.", topSource?.path, approvalGates),
        buildStep(2, "영향받은 기능, 고객 영향, 담당 팀을 incident thread에 기록합니다.", topSource?.path, approvalGates)
      ])
    },
    {
      id: "mitigation",
      title: "완화 조치",
      objective: "고객 영향이 커지지 않도록 안전한 조치부터 실행합니다.",
      steps: ensureSteps(mitigationSteps, [
        buildStep(1, "재시도, 롤백, 큐 일시정지처럼 문서화된 완화 조치를 검토합니다.", topSource?.path, approvalGates),
        buildStep(2, `${incident} 요청에 민감 작업이 있으면 승인 전 실행하지 않습니다.`, topSource?.path, approvalGates)
      ])
    },
    {
      id: "communication",
      title: "상황 공유",
      objective: "상태 공유 지연으로 운영 혼선을 만들지 않습니다.",
      steps: [
        buildStep(1, "담당 채널에 현재 영향, 조치 담당자, 다음 업데이트 시각을 남깁니다.", topSource?.path, approvalGates),
        buildStep(2, "고객 영향이 확인되면 상태 페이지 공지 기준을 확인합니다.", findStatusPageSource(sources)?.path ?? topSource?.path, approvalGates)
      ]
    },
    {
      id: "recovery",
      title: "복구 검증",
      objective: "증상이 사라졌는지 수치와 문서 기준으로 확인한 뒤 종료합니다.",
      steps: [
        buildStep(1, "원인 지표가 정상 범위로 돌아왔는지 확인합니다.", topSource?.path, approvalGates),
        buildStep(2, "수동 변경이나 데이터 보정이 필요하면 승인 기록을 먼저 남깁니다.", topSource?.path, approvalGates)
      ]
    }
  ];
}

function buildStep(
  order: number,
  action: string,
  sourcePath: string | undefined,
  approvalGates: IncidentResponsePlan["approvalGates"]
): IncidentResponsePlan["phases"][number]["steps"][number] {
  return {
    order,
    action: stripInlineMarkdown(action),
    sourcePath,
    requiresApproval: isApprovalAction(action, approvalGates),
    evidence: sourcePath ? `근거 문서: ${sourcePath}` : "근거 문서가 부족해 담당자 확인이 필요합니다."
  };
}

function ensureSteps(
  primary: IncidentResponsePlan["phases"][number]["steps"],
  fallback: IncidentResponsePlan["phases"][number]["steps"]
): IncidentResponsePlan["phases"][number]["steps"] {
  return primary.length > 0 ? primary : fallback;
}

function extractOperationalSteps(sources: SearchResult[]): string[] {
  const steps = sources
    .flatMap((source) =>
      source.content
        .split(/\n+/)
        .map((line) => line.trim())
        .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1] ?? line)
        .filter((line) => /check|verify|notify|rollback|pause|scale|공지|확인|알림|중지|복구|승인|보고/i.test(line))
        .map((line) => line.replace(/^[-*]\s+/, ""))
        .map((line) => ({ line, path: source.path }))
    )
    .slice(0, 8);

  return steps.map((step) => step.line);
}

function buildApprovalGates(
  incident: string,
  sources: SearchResult[],
  sensitiveIncident: boolean
): IncidentResponsePlan["approvalGates"] {
  const text = `${incident} ${sources.map((source) => source.content).join(" ")}`;
  const gates: IncidentResponsePlan["approvalGates"] = [];
  if (sensitiveIncident || /manual|직접|운영\s*DB|production DB|delete|deleting|balance|강제\s*환불|권한\s*부여/i.test(text)) {
    gates.push({
      action: "민감 운영 변경",
      reason: "데이터 수정, 삭제, 권한 부여, 강제 환불, production 조작은 자동 실행하지 않습니다.",
      policy: "human_required"
    });
  }
  if (/pause|rollback|scale|retry jobs|일시\s*정지|중지|롤백|재시도\s*작업|키.*삭제|keys.*delet/i.test(text)) {
    gates.push({
      action: "운영 영향 조치",
      reason: "서비스 동작을 바꾸는 완화 조치는 담당자 승인 후 실행해야 합니다.",
      policy: "human_required"
    });
  }
  return dedupeApprovalGates(gates);
}

function dedupeApprovalGates(gates: IncidentResponsePlan["approvalGates"]): IncidentResponsePlan["approvalGates"] {
  return [...new Map(gates.map((gate) => [gate.action, gate])).values()];
}

function isApprovalAction(action: string, approvalGates: IncidentResponsePlan["approvalGates"]): boolean {
  if (approvalGates.length === 0) {
    return false;
  }
  return /pause|rollback|delete|직접|수동|운영|production|환불|권한|일시\s*정지|중지|삭제|보정|balance|retry jobs/i.test(action);
}

function buildCommunications(
  incident: string,
  sources: SearchResult[],
  severity: IncidentResponsePlan["severity"]
): IncidentResponsePlan["communications"] {
  const oncallChannel = findChannel(sources) ?? "#ops-oncall";
  return [
    {
      channel: oncallChannel,
      trigger: "플랜 생성 직후",
      message: `${incident} 대응을 시작합니다. 심각도 ${formatSeverity(severity)}, 담당자와 다음 업데이트 시각을 지정하세요.`
    },
    {
      channel: "상태 페이지",
      trigger: "고객 영향 확인 시",
      message: "영향받은 기능, 현재 영향도, 다음 업데이트 예정 시각, 장애 담당자를 포함해 공지합니다."
    }
  ];
}

function buildVerification(sources: SearchResult[], checklist: RunbookChecklist | null): IncidentResponsePlan["verification"] {
  const checks = extractVerificationChecks(sources);
  if (checks.length > 0) {
    return checks.slice(0, 5);
  }

  return [
    {
      check: checklist ? `${checklist.title} 체크리스트 항목을 모두 재확인합니다.` : "상위 출처의 복구 조건을 재확인합니다.",
      expected: "증상 지표가 정상화되고 추가 승인 대기 작업이 없습니다.",
      sourcePath: checklist?.path ?? sources[0]?.path
    }
  ];
}

function extractVerificationChecks(sources: SearchResult[]): IncidentResponsePlan["verification"] {
  return sources.flatMap((source) =>
    source.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => /verify|정상|reprocessed|report|completed_at|connection count|memory|dlq|확인/i.test(line))
      .slice(0, 3)
      .map((line) => ({
        check: stripInlineMarkdown(line.replace(/^[-*\d.]+\s+/, "")),
        expected: "문서에 정의된 임계치 또는 정상 조건을 만족합니다.",
        sourcePath: source.path
      }))
  );
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1").trim();
}

function summarizePlan(
  incident: string,
  severity: IncidentResponsePlan["severity"],
  sources: SearchResult[],
  approvalGates: IncidentResponsePlan["approvalGates"]
): string {
  const sourceSummary = sources[0] ? `${sources[0].title}를 1순위 근거로 사용합니다.` : "근거 문서가 부족합니다.";
  const approvalSummary = approvalGates.length > 0 ? ` 승인 필요 작업 ${approvalGates.length}개를 분리했습니다.` : " 자동 실행 가능한 읽기/검증 중심 플랜입니다.";
  return `${incident}에 대한 ${formatSeverity(severity)} 대응 플랜입니다. ${sourceSummary}${approvalSummary}`;
}

function findStatusPageSource(sources: SearchResult[]): SearchResult | undefined {
  return sources.find((source) => /status|공지|communication/i.test(`${source.title} ${source.path} ${source.content}`));
}

function findChannel(sources: SearchResult[]): string | undefined {
  const match = sources.map((source) => source.content).join("\n").match(/#[a-z0-9_-]+/i);
  return match?.[0];
}

function formatSeverity(severity: IncidentResponsePlan["severity"]): string {
  const labels: Record<IncidentResponsePlan["severity"], string> = {
    sev1: "SEV1",
    sev2: "SEV2",
    sev3: "SEV3"
  };
  return labels[severity];
}
