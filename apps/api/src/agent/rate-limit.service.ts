import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Socket } from "node:net";
import { RequestContext } from "../shared/request-context";

export type RateLimitDecision = {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
};

@Injectable()
export class RateLimitService {
  async enforceAskLimit(context: RequestContext): Promise<RateLimitDecision> {
    if (process.env.ASK_RATE_LIMIT_DISABLED === "true") {
      return allowWithoutLimit();
    }

    const decision = await this.checkFixedWindow({
      actorKey: actorRateLimitKey(context),
      route: "ask",
      limit: readPositiveInt("ASK_RATE_LIMIT_MAX", 300),
      windowSeconds: readPositiveInt("ASK_RATE_LIMIT_WINDOW_SECONDS", 60)
    });

    if (!decision.allowed) {
      throw new HttpException(
        {
          message: "질문 요청 한도를 초과했습니다.",
          rateLimit: decision
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return decision;
  }

  private async checkFixedWindow(input: {
    actorKey: string;
    route: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitDecision> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSeconds / input.windowSeconds) * input.windowSeconds;
    const resetSeconds = windowStart + input.windowSeconds;
    const key = `opspilot:ratelimit:${input.route}:${hashKey(input.actorKey)}:${windowStart}`;
    const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    const count = await redisIntegerCommand(redisUrl, ["INCR", key]);
    if (count === 1) {
      await redisIntegerCommand(redisUrl, ["EXPIRE", key, String(input.windowSeconds + 5)]);
    }

    return {
      allowed: count <= input.limit,
      key,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt: new Date(resetSeconds * 1000).toISOString(),
      retryAfterSeconds: Math.max(1, resetSeconds - nowSeconds)
    };
  }
}

function actorRateLimitKey(context: RequestContext): string {
  return [
    context.actorId ? `id:${context.actorId}` : "id:anonymous",
    context.email ? `email:${context.email}` : "email:none",
    `roles:${context.roles.slice().sort().join("|") || "none"}`,
    `teams:${context.teamSlugs.slice().sort().join("|") || "none"}`
  ].join(";");
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function allowWithoutLimit(): RateLimitDecision {
  return {
    allowed: true,
    key: "disabled",
    limit: Number.MAX_SAFE_INTEGER,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
    retryAfterSeconds: 60
  };
}

function redisIntegerCommand(redisUrl: URL, parts: string[]): Promise<number> {
  return redisCommand(redisUrl, parts).then((reply) => {
    const value = Number(reply);
    if (!Number.isFinite(value)) {
      throw new Error(`Unexpected Redis integer reply: ${reply}`);
    }
    return value;
  });
}

function redisCommand(redisUrl: URL, parts: string[]): Promise<string> {
  const port = Number(redisUrl.port || 6379);
  const db = redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : undefined;
  const commands = [
    redisUrl.password ? encodeRedisCommand(["AUTH", ...(redisUrl.username ? [decodeURIComponent(redisUrl.username)] : []), decodeURIComponent(redisUrl.password)]) : "",
    Number.isFinite(db) ? encodeRedisCommand(["SELECT", String(db)]) : "",
    encodeRedisCommand(parts)
  ].filter(Boolean);

  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis rate limit command timed out"));
    }, 1500);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.connect(port, redisUrl.hostname, () => {
      socket.write(commands.join(""));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const parsed = parseLastRedisReply(buffer);
      if (!parsed.complete) {
        return;
      }
      clearTimeout(timeout);
      socket.end();
      if (parsed.error) {
        reject(new Error(parsed.error));
      } else {
        resolve(parsed.value);
      }
    });
  });
}

function parseLastRedisReply(buffer: string): { complete: boolean; value: string; error?: string } {
  const replies = buffer
    .split("\r\n")
    .filter(Boolean)
    .filter((line) => line.startsWith(":") || line.startsWith("+") || line.startsWith("-"));
  const last = replies[replies.length - 1];
  if (!last) {
    return { complete: false, value: "" };
  }
  if (last.startsWith("-")) {
    return { complete: true, value: "", error: last.slice(1) };
  }
  return { complete: true, value: last.slice(1) };
}

function encodeRedisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}
