import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { DocumentVisibility } from "../database/entities/types";
import { RequestContext } from "../shared/request-context";

export type PermissionBoundaryMatrix = {
  generatedAt: string;
  policy: {
    visibilityLevels: Array<{
      visibility: DocumentVisibility;
      rule: string;
    }>;
    personas: Array<PermissionPersona>;
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

type PermissionPersona = {
  id: string;
  label: string;
  roles: string[];
  teamSlugs: string[];
};

type PermissionDocumentRow = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
};

@Injectable()
export class AuthzService {
  constructor(private readonly orm: MikroORM) {}

  canAccessDocument(context: RequestContext, visibility: string, teamSlug?: string | null): boolean {
    if (visibility === DocumentVisibility.Public) {
      return true;
    }

    if (visibility === DocumentVisibility.Team) {
      return Boolean(teamSlug && context.teamSlugs.includes(teamSlug));
    }

    if (visibility === DocumentVisibility.Restricted) {
      return context.roles.includes("ops_admin") || context.roles.includes("security_admin");
    }

    return false;
  }

  retrievalWhereClause(context: RequestContext): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const clauses = ["d.visibility = 'public'"];

    if (context.teamSlugs.length > 0) {
      clauses.push(`d.visibility = 'team' and d.team_slug in (${context.teamSlugs.map(() => "?").join(", ")})`);
      params.push(...context.teamSlugs);
    }

    if (context.roles.includes("ops_admin") || context.roles.includes("security_admin")) {
      clauses.push("d.visibility = 'restricted'");
    }

    return {
      sql: `(${clauses.map((clause) => `(${clause})`).join(" or ")})`,
      params
    };
  }

  isSensitiveAction(question: string): boolean {
    return /(직접\s*(수정|변경|삭제|실행)|delete|update|drop|권한\s*부여|운영\s*db|production|prod\s*db|강제\s*환불)/i.test(question);
  }

  async getPermissionBoundaryMatrix(limit = 100): Promise<PermissionBoundaryMatrix> {
    const connection = this.orm.em.fork().getConnection();
    const documents = (await connection.execute<PermissionDocumentRow[]>(
      `
        select
          id,
          path,
          title,
          visibility,
          team_slug as "teamSlug"
        from documents
        order by
          case visibility
            when 'restricted' then 1
            when 'team' then 2
            else 3
          end,
          path asc
        limit ?;
      `,
      [limit]
    )) as PermissionDocumentRow[];

    const personas = buildPermissionPersonas(documents);
    const matrixDocuments = documents.map((document) => ({
      id: document.id,
      path: document.path,
      title: document.title,
      visibility: document.visibility,
      teamSlug: document.teamSlug,
      decisions: personas.map((persona) => {
        const allowed = this.canAccessDocument(persona, document.visibility, document.teamSlug);
        return {
          persona: persona.id,
          allowed,
          reason: explainDocumentDecision(persona, document, allowed)
        };
      })
    }));

    return {
      generatedAt: new Date().toISOString(),
      policy: {
        visibilityLevels: [
          { visibility: DocumentVisibility.Public, rule: "프롬프트 구성 전에 모든 호출자에게 허용됩니다." },
          { visibility: DocumentVisibility.Team, rule: "호출자의 팀 목록에 문서 팀 slug가 있을 때만 허용됩니다." },
          {
            visibility: DocumentVisibility.Restricted,
            rule: "ops_admin 또는 security_admin 역할을 가진 호출자에게만 허용됩니다."
          }
        ],
        personas
      },
      documents: matrixDocuments,
      summary: personas.map((persona) => {
        const decisions = matrixDocuments.flatMap((document) =>
          document.decisions.filter((decision) => decision.persona === persona.id)
        );
        return {
          persona: persona.id,
          allowed: decisions.filter((decision) => decision.allowed).length,
          denied: decisions.filter((decision) => !decision.allowed).length
        };
      })
    };
  }
}

function buildPermissionPersonas(documents: PermissionDocumentRow[]): PermissionPersona[] {
  const teamSlugs = [...new Set(documents.map((document) => document.teamSlug).filter((teamSlug): teamSlug is string => Boolean(teamSlug)))];
  const primaryTeamSlug = teamSlugs[0] ?? "payments";

  return [
    { id: "anonymous", label: "익명 사용자", roles: [], teamSlugs: [] },
    { id: `${primaryTeamSlug}_oncall`, label: `${primaryTeamSlug} 온콜`, roles: ["support_agent"], teamSlugs: [primaryTeamSlug] },
    { id: "ops_admin", label: "운영 관리자", roles: ["ops_admin"], teamSlugs: [primaryTeamSlug] },
    { id: "security_admin", label: "보안 관리자", roles: ["security_admin"], teamSlugs: [] }
  ];
}

function explainDocumentDecision(persona: PermissionPersona, document: PermissionDocumentRow, allowed: boolean): string {
  if (document.visibility === DocumentVisibility.Public) {
    return "공개 문서";
  }

  if (document.visibility === DocumentVisibility.Team) {
    return allowed
      ? `팀 일치: ${document.teamSlug}`
      : `팀 불일치: ${document.teamSlug ?? "팀"} 필요, 호출자 팀 ${persona.teamSlugs.join("|") || "없음"}`;
  }

  if (document.visibility === DocumentVisibility.Restricted) {
    return allowed
      ? `관리 권한 역할: ${persona.roles.find((role) => role === "ops_admin" || role === "security_admin")}`
      : "ops_admin 또는 security_admin 필요";
  }

  return "알 수 없는 공개 범위";
}
