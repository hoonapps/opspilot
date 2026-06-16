import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { User } from "../database/entities/user.entity";
import { Team } from "../database/entities/team.entity";
import { Document } from "../database/entities/document.entity";
import { DocumentVersion } from "../database/entities/document-version.entity";
import { DocumentChunk } from "../database/entities/document-chunk.entity";
import { Question } from "../database/entities/question.entity";
import { Answer } from "../database/entities/answer.entity";
import { AnswerSource } from "../database/entities/answer-source.entity";
import { ToolCallLog } from "../database/entities/tool-call-log.entity";
import { ApprovalRequest } from "../database/entities/approval-request.entity";
import { Feedback } from "../database/entities/feedback.entity";
import { EvaluationResult } from "../database/entities/evaluation-result.entity";

loadEnv({ path: join(process.cwd(), ".env") });
loadEnv({ path: join(process.cwd(), "../../.env") });

export default defineConfig({
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  dbName: process.env.DATABASE_NAME ?? "opspilot",
  user: process.env.DATABASE_USER ?? "opspilot",
  password: process.env.DATABASE_PASSWORD ?? "opspilot",
  entities: [
    User,
    Team,
    Document,
    DocumentVersion,
    DocumentChunk,
    Question,
    Answer,
    AnswerSource,
    ToolCallLog,
    ApprovalRequest,
    Feedback,
    EvaluationResult
  ],
  extensions: [Migrator],
  migrations: {
    path: "dist/database/migrations",
    pathTs: "src/database/migrations"
  },
  debug: process.env.MIKRO_ORM_DEBUG === "true"
});
