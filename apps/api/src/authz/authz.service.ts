import { Injectable } from "@nestjs/common";
import { DocumentVisibility } from "../database/entities/types";
import { RequestContext } from "../shared/request-context";

@Injectable()
export class AuthzService {
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
      clauses.push("d.visibility = 'team' and d.team_slug = any(?::text[])");
      params.push(context.teamSlugs);
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
}
