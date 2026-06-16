import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { Socket } from "node:net";

export type DependencyCheck = {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  latencyMs?: number;
  detail?: string;
};

export type ReadinessReport = {
  ok: boolean;
  service: "opspilot-api";
  dependencies: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    elasticsearch: DependencyCheck;
  };
};

@Injectable()
export class HealthService {
  constructor(private readonly orm: MikroORM) {}

  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis, elasticsearch] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkElasticsearch()
    ]);

    return {
      ok: postgres.ok && redis.ok && elasticsearch.ok,
      service: "opspilot-api",
      dependencies: {
        postgres,
        redis,
        elasticsearch
      }
    };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    return timedCheck(async () => {
      await this.orm.em.fork().getConnection().execute("select 1 as ready;");
    });
  }

  private async checkRedis(): Promise<DependencyCheck> {
    return timedCheck(async () => {
      const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
      await redisPing(redisUrl);
    });
  }

  private async checkElasticsearch(): Promise<DependencyCheck> {
    if (process.env.ENABLE_ELASTICSEARCH !== "true") {
      return {
        ok: true,
        status: "skipped",
        detail: "Elasticsearch is disabled"
      };
    }

    return timedCheck(async () => {
      const url = new URL(process.env.ELASTICSEARCH_URL ?? "http://localhost:29200");
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    });
  }
}

async function timedCheck(check: () => Promise<void>): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await check();
    return {
      ok: true,
      status: "ok",
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function redisPing(redisUrl: URL): Promise<void> {
  const port = Number(redisUrl.port || 6379);
  const db = redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : undefined;
  const commands = [
    redisUrl.password ? redisCommand(["AUTH", ...(redisUrl.username ? [decodeURIComponent(redisUrl.username)] : []), decodeURIComponent(redisUrl.password)]) : "",
    Number.isFinite(db) ? redisCommand(["SELECT", String(db)]) : "",
    redisCommand(["PING"])
  ].filter(Boolean);

  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis readiness check timed out"));
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
      if (buffer.includes("-ERR")) {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(buffer.trim()));
        return;
      }

      if (buffer.includes("+PONG")) {
        clearTimeout(timeout);
        socket.end();
        resolve();
      }
    });
  });
}

function redisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}
