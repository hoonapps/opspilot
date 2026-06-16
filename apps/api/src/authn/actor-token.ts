import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestContext } from "../shared/request-context";

export type ActorTokenClaims = {
  sub: string;
  email?: string;
  roles?: string[];
  teamSlugs?: string[];
  exp: number;
};

export class ActorTokenError extends Error {}

export function signActorToken(claims: ActorTokenClaims, secret: string): string {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64urlEncode(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function verifyActorToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): RequestContext {
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra !== undefined) {
    throw new ActorTokenError("Malformed actor token");
  }

  assertValidSignature(`${header}.${payload}`, signature, secret);

  const parsedHeader = parseJson<{ alg?: string; typ?: string }>(header);
  if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") {
    throw new ActorTokenError("Unsupported actor token header");
  }

  const claims = parseJson<ActorTokenClaims>(payload);
  if (!claims.sub || typeof claims.sub !== "string") {
    throw new ActorTokenError("Actor token subject is required");
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= now) {
    throw new ActorTokenError("Actor token expired");
  }

  return {
    actorId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    roles: arrayOfStrings(claims.roles),
    teamSlugs: arrayOfStrings(claims.teamSlugs)
  };
}

function parseJson<T>(base64url: string): T {
  try {
    return JSON.parse(base64urlDecode(base64url).toString("utf8")) as T;
  } catch {
    throw new ActorTokenError("Actor token payload is not valid JSON");
  }
}

function assertValidSignature(message: string, signature: string, secret: string): void {
  const expected = sign(message, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new ActorTokenError("Actor token signature mismatch");
  }
}

function sign(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
