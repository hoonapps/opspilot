import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("OpsPilot API")
    .setDescription("권한 인식 RAG 에이전트 API")
    .setVersion("0.1.0")
    .addApiKey(
      {
        type: "apiKey",
        name: "x-opspilot-actor-token",
        in: "header",
        description: "OPSPILOT_ACTOR_TOKEN_SECRET이 설정됐을 때 사용하는 서명된 호출자 토큰입니다."
      },
      "actor-token"
    )
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, createOpenApiDocument(app));
}
