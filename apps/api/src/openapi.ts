import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("OpsPilot API")
    .setDescription("Permission-aware RAG agent API")
    .setVersion("0.1.0")
    .addApiKey(
      {
        type: "apiKey",
        name: "x-opspilot-actor-token",
        in: "header",
        description: "Signed actor token used when OPSPILOT_ACTOR_TOKEN_SECRET is configured."
      },
      "actor-token"
    )
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, createOpenApiDocument(app));
}
