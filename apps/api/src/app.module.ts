import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import mikroOrmConfig from "./config/mikro-orm.config";
import { AgentModule } from "./agent/agent.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { AuthzModule } from "./authz/authz.module";
import { DocumentsModule } from "./documents/documents.module";
import { EvaluationModule } from "./evaluation/evaluation.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { HealthModule } from "./health/health.module";
import { SlackModule } from "./slack/slack.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    AuthzModule,
    DocumentsModule,
    AgentModule,
    ApprovalsModule,
    FeedbackModule,
    EvaluationModule,
    SlackModule,
    HealthModule
  ]
})
export class AppModule {}
