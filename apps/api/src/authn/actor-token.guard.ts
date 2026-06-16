import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyActorToken } from "./actor-token";

@Injectable()
export class ActorTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      originalUrl?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (!process.env.OPSPILOT_ACTOR_TOKEN_SECRET || this.isPublicRoute(request.method, request.path ?? request.originalUrl ?? "")) {
      return true;
    }

    const token = readHeader(request.headers, "x-opspilot-actor-token");
    if (!token) {
      throw new UnauthorizedException("Missing OpsPilot actor token");
    }

    try {
      verifyActorToken(token, process.env.OPSPILOT_ACTOR_TOKEN_SECRET);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid OpsPilot actor token");
    }
  }

  private isPublicRoute(method = "GET", path: string): boolean {
    if (method.toUpperCase() === "OPTIONS") {
      return true;
    }

    return path === "/health" || path === "/health/ready" || path.startsWith("/docs") || path === "/slack/events";
  }
}

function readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
