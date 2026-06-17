import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { createHash } from "node:crypto";
import { RequestContext } from "../shared/request-context";

export type IdempotencyMetadata = {
  key: string;
  replayed: boolean;
  requestHash: string;
  expiresAt: string;
};

export type IdempotentAskResult<T extends object> = Omit<T, "idempotency"> & {
  idempotency: IdempotencyMetadata;
};

type IdempotencyRow = {
  id: string;
  requestHash: string;
  response: Record<string, unknown> | null;
  status: "in_progress" | "completed" | "failed";
  expiresAt: Date | string;
};

@Injectable()
export class AskIdempotencyService {
  constructor(private readonly orm: MikroORM) {}

  async execute<T extends object>(input: {
    key: string;
    context: RequestContext;
    request: Record<string, unknown>;
    handler: () => Promise<T>;
  }): Promise<IdempotentAskResult<T>> {
    const key = normalizeIdempotencyKey(input.key);
    const requestHash = sha256StableJson(input.request);
    const scopeHash = actorScopeHash(input.context);
    const ttlSeconds = readPositiveInt("ASK_IDEMPOTENCY_TTL_SECONDS", 24 * 60 * 60);
    const connection = this.orm.em.fork().getConnection();

    await connection.execute("delete from ask_idempotency_keys where expires_at <= now();");

    const inserted = (await connection.execute<IdempotencyRow[]>(
      `
        insert into ask_idempotency_keys (scope_hash, idempotency_key, request_hash, status, expires_at)
        values (?, ?, ?, 'in_progress', now() + (?::int * interval '1 second'))
        on conflict (scope_hash, idempotency_key) do nothing
        returning id, request_hash as "requestHash", response, status, expires_at as "expiresAt";
      `,
      [scopeHash, key, requestHash, ttlSeconds]
    )) as IdempotencyRow[];

    if (inserted[0]) {
      return this.runAndPersist({ row: inserted[0], key, requestHash, handler: input.handler });
    }

    const [existing] = (await connection.execute<IdempotencyRow[]>(
      `
        select
          id,
          request_hash as "requestHash",
          response,
          status,
          expires_at as "expiresAt"
        from ask_idempotency_keys
        where scope_hash = ? and idempotency_key = ? and expires_at > now();
      `,
      [scopeHash, key]
    )) as IdempotencyRow[];

    if (!existing) {
      return this.execute(input);
    }

    if (existing.requestHash !== requestHash) {
      throw new HttpException(
        {
          message: "같은 idempotency key로 다른 /ask 요청을 재사용할 수 없습니다.",
          idempotency: {
            key,
            status: "conflict"
          }
        },
        HttpStatus.CONFLICT
      );
    }

    if (existing.status === "completed" && existing.response) {
      return attachIdempotency(existing.response as T, {
        key,
        requestHash,
        replayed: true,
        expiresAt: toIsoString(existing.expiresAt)
      });
    }

    throw new HttpException(
      {
        message: "같은 idempotency key 요청이 아직 처리 중입니다.",
        idempotency: {
          key,
          status: existing.status,
          retryable: true
        }
      },
      HttpStatus.CONFLICT
    );
  }

  private async runAndPersist<T extends object>(input: {
    row: IdempotencyRow;
    key: string;
    requestHash: string;
    handler: () => Promise<T>;
  }): Promise<IdempotentAskResult<T>> {
    const connection = this.orm.em.fork().getConnection();
    try {
      const response = await input.handler();
      await connection.execute(
        `
          update ask_idempotency_keys
          set response = ?::jsonb, status = 'completed'
          where id = ?::uuid;
        `,
        [JSON.stringify(response), input.row.id]
      );

      return attachIdempotency(response, {
        key: input.key,
        requestHash: input.requestHash,
        replayed: false,
        expiresAt: toIsoString(input.row.expiresAt)
      });
    } catch (error) {
      await connection.execute("delete from ask_idempotency_keys where id = ?::uuid;", [input.row.id]);
      throw error;
    }
  }
}

function attachIdempotency<T extends object>(
  response: T,
  idempotency: IdempotencyMetadata
): IdempotentAskResult<T> {
  return {
    ...response,
    idempotency
  } as IdempotentAskResult<T>;
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    throw new HttpException(
      {
        message: "x-idempotency-key는 1~128자의 영문, 숫자, '.', '_', ':', '-'만 사용할 수 있습니다."
      },
      HttpStatus.BAD_REQUEST
    );
  }
  return key;
}

function actorScopeHash(context: RequestContext): string {
  return sha256StableJson({
    actorId: context.actorId ?? null,
    email: context.email ?? null,
    roles: context.roles.slice().sort(),
    teamSlugs: context.teamSlugs.slice().sort()
  });
}

function sha256StableJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "\"__undefined__\"";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
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

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
