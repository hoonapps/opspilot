import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { OpenAPIObject } from "@nestjs/swagger";
import { AppModule } from "../app.module";
import { createOpenApiDocument } from "../openapi";

type HttpMethod = "get" | "post" | "patch";
type OpenApiOperation = {
  operationId?: string;
  parameters?: Array<{ name?: string; in?: string }>;
  requestBody?: { $ref: string } | { content?: Record<string, { schema?: { $ref?: string } }> };
};

const REQUIRED_OPERATIONS: Array<{ path: string; method: HttpMethod; operationId?: string }> = [
  { path: "/ask", method: "post", operationId: "AgentController_ask" },
  { path: "/retrieval/preview", method: "post", operationId: "AgentController_previewRetrieval" },
  { path: "/incidents/plan", method: "post", operationId: "AgentController_createIncidentPlan" },
  { path: "/permission-boundary/matrix", method: "get", operationId: "AuthzController_getPermissionBoundaryMatrix" },
  { path: "/documents", method: "get", operationId: "DocumentsController_listDocuments" },
  { path: "/documents/{id}/versions", method: "get", operationId: "DocumentsController_getDocumentVersions" },
  { path: "/documents/markdown", method: "post", operationId: "DocumentsController_upsertMarkdownDocument" },
  { path: "/documents/github/sync", method: "post", operationId: "DocumentsController_syncGithubDocuments" },
  { path: "/documents/indexing-jobs", method: "get" },
  { path: "/documents/indexing-jobs/markdown", method: "post" },
  { path: "/documents/indexing-jobs/{id}", method: "get" },
  { path: "/answers/{id}/trace", method: "get" },
  { path: "/answers/{id}/proof", method: "get" },
  { path: "/answers/{id}/replay", method: "get" },
  { path: "/answers/{id}/evidence-bundle", method: "get" },
  { path: "/tool-calls/registry", method: "get" },
  { path: "/tool-calls/recent", method: "get" },
  { path: "/approvals", method: "get" },
  { path: "/approvals/{id}", method: "patch" },
  { path: "/feedback", method: "post" },
  { path: "/evaluations/latest", method: "get" },
  { path: "/evaluations/history", method: "get" },
  { path: "/observability/summary", method: "get" },
  { path: "/observability/api-requests", method: "get" },
  { path: "/observability/slo", method: "get" },
  { path: "/observability/release-gate", method: "get" },
  { path: "/health", method: "get" },
  { path: "/health/ready", method: "get" },
  { path: "/slack/events", method: "post" },
  { path: "/slack/simulate", method: "post" }
];

const REQUIRED_SCHEMAS = [
  "AskDto",
  "RetrievalPreviewDto",
  "IncidentPlanDto",
  "UpsertMarkdownDocumentDto",
  "SyncGithubDocumentsDto",
  "UpdateApprovalDto",
  "CreateFeedbackDto",
  "SlackEventPayload"
];

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  try {
    const document = createOpenApiDocument(app);
    const missingOperations = REQUIRED_OPERATIONS.filter((requirement) => {
      const operation = getOperation(document, requirement.path, requirement.method);
      if (!operation) {
        return true;
      }
      return requirement.operationId ? operation.operationId !== requirement.operationId : false;
    });
    const schemas = document.components?.schemas ?? {};
    const missingSchemas = REQUIRED_SCHEMAS.filter((schemaName) => !schemas[schemaName]);
    const actorTokenScheme = document.components?.securitySchemes?.["actor-token"];
    const askRequestSchema = getRequestSchemaRef(document, "/ask", "post");
    const askHasIdempotencyHeader = hasHeaderParameter(document, "/ask", "post", "x-idempotency-key");
    const retrievalPreviewSchema = getRequestSchemaRef(document, "/retrieval/preview", "post");
    const incidentPlanSchema = getRequestSchemaRef(document, "/incidents/plan", "post");
    const markdownRequestSchema = getRequestSchemaRef(document, "/documents/markdown", "post");
    const updateApprovalSchema = getRequestSchemaRef(document, "/approvals/{id}", "patch");

    const ok =
      missingOperations.length === 0 &&
      missingSchemas.length === 0 &&
      isApiKeyScheme(actorTokenScheme) &&
      askRequestSchema === "#/components/schemas/AskDto" &&
      askHasIdempotencyHeader &&
      retrievalPreviewSchema === "#/components/schemas/RetrievalPreviewDto" &&
      incidentPlanSchema === "#/components/schemas/IncidentPlanDto" &&
      markdownRequestSchema === "#/components/schemas/UpsertMarkdownDocumentDto" &&
      updateApprovalSchema === "#/components/schemas/UpdateApprovalDto";

    const report = {
      ok,
      title: document.info.title,
      version: document.info.version,
      pathCount: Object.keys(document.paths).length,
      requiredOperationCount: REQUIRED_OPERATIONS.length,
      missingOperations,
      missingSchemas,
      securitySchemes: Object.keys(document.components?.securitySchemes ?? {}),
      requestSchemas: {
        ask: askRequestSchema,
        retrievalPreview: retrievalPreviewSchema,
        incidentPlan: incidentPlanSchema,
        markdown: markdownRequestSchema,
        updateApproval: updateApprovalSchema
      },
      headers: {
        askHasIdempotencyHeader
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("OpenAPI smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function hasHeaderParameter(document: OpenAPIObject, path: string, method: HttpMethod, name: string): boolean {
  return getOperation(document, path, method)?.parameters?.some((parameter) => {
    return parameter.in === "header" && parameter.name?.toLowerCase() === name.toLowerCase();
  }) === true;
}

function getOperation(document: OpenAPIObject, path: string, method: HttpMethod): OpenApiOperation | undefined {
  const pathItem = document.paths[path];
  const value = pathItem ? (pathItem as Record<string, unknown>)[method] : undefined;
  return value && typeof value === "object" ? (value as OpenApiOperation) : undefined;
}

function getRequestSchemaRef(document: OpenAPIObject, path: string, method: HttpMethod): string | undefined {
  const operation = getOperation(document, path, method);
  const requestBody = operation?.requestBody;
  if (!requestBody || "$ref" in requestBody) {
    return undefined;
  }
  return requestBody.content?.["application/json"]?.schema?.$ref;
}

function isApiKeyScheme(value: unknown): boolean {
  return typeof value === "object" && value !== null && !("$ref" in value) && (value as { type?: unknown }).type === "apiKey";
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
