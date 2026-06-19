import type { NestExpressApplication } from "@nestjs/platform-express";

export const DEFAULT_REQUEST_BODY_LIMIT = "20mb";

export function requestBodyLimit(): string {
  return process.env.OPSPILOT_REQUEST_BODY_LIMIT ?? DEFAULT_REQUEST_BODY_LIMIT;
}

export function configureRequestBody(app: NestExpressApplication): void {
  const limit = requestBodyLimit();

  app.useBodyParser("json", { limit });
  app.useBodyParser("urlencoded", { limit, extended: true });
}
