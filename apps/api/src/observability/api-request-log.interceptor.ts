import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { Observable, catchError, finalize, throwError } from "rxjs";
import { sha256 } from "../shared/hash";
import { parseRequestContext, RequestContext } from "../shared/request-context";

type HttpRequestLike = {
  method?: string;
  path?: string;
  originalUrl?: string;
  baseUrl?: string;
  route?: { path?: string };
  headers?: Record<string, string | string[] | undefined>;
};

type HttpResponseLike = {
  statusCode?: number;
};

@Injectable()
export class ApiRequestLogInterceptor implements NestInterceptor {
  constructor(private readonly orm: MikroORM) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    const startedAt = Date.now();
    let errorName: string | null = null;
    let errorStatus: number | null = null;

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorName = error instanceof Error ? error.name : "UnknownError";
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const durationMs = Math.max(0, Date.now() - startedAt);
        const statusCode = errorStatus ?? response.statusCode ?? 200;
        void this.recordRequest({ request, statusCode, durationMs, errorName });
      })
    );
  }

  private async recordRequest(input: {
    request: HttpRequestLike;
    statusCode: number;
    durationMs: number;
    errorName: string | null;
  }) {
    try {
      const headers = input.request.headers ?? {};
      const context = safeParseContext(headers);
      const route = routeTemplate(input.request);
      await this.orm.em.fork().getConnection().execute(
        `
          insert into api_request_logs (
            request_id,
            method,
            path,
            route,
            status_code,
            duration_ms,
            actor_hash,
            roles,
            team_slugs,
            user_agent,
            error_name
          )
          values (?, ?, ?, ?, ?, ?, ?, ?::text[], ?::text[], ?, ?);
        `,
        [
          readHeader(headers, "x-request-id") ?? readHeader(headers, "x-correlation-id") ?? null,
          (input.request.method ?? "UNKNOWN").toUpperCase(),
          sanitizePath(input.request.path ?? input.request.originalUrl ?? "/"),
          route,
          input.statusCode,
          input.durationMs,
          context ? actorHash(context) : null,
          toPostgresTextArray(context?.roles ?? []),
          toPostgresTextArray(context?.teamSlugs ?? []),
          trimHeader(readHeader(headers, "user-agent"), 220),
          input.errorName
        ]
      );
    } catch {
      // Request logging must never change API behavior.
    }
  }
}

function safeParseContext(headers: Record<string, string | string[] | undefined>): RequestContext | null {
  try {
    return parseRequestContext(headers);
  } catch {
    return null;
  }
}

function actorHash(context: RequestContext): string {
  return sha256(
    JSON.stringify({
      actorId: context.actorId ?? null,
      email: context.email ?? null,
      roles: [...context.roles].sort(),
      teamSlugs: [...context.teamSlugs].sort()
    })
  );
}

function routeTemplate(request: HttpRequestLike): string {
  const routePath = request.route?.path;
  const baseUrl = request.baseUrl && request.baseUrl !== "/" ? request.baseUrl : "";
  if (typeof routePath === "string") {
    return `${baseUrl}${routePath === "/" ? "" : routePath}` || "/";
  }
  return sanitizePath(request.path ?? request.originalUrl ?? "/");
}

function sanitizePath(path: string): string {
  const [cleanPath] = path.split("?");
  return cleanPath || "/";
}

function readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function trimHeader(value: string | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function toPostgresTextArray(values: string[]): string {
  if (!values.length) {
    return "{}";
  }
  return `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}
