import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ObservabilityService } from "../observability/observability.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const requestPrefix = `error-budget-smoke-${randomUUID()}`;
  const connection = app.get(MikroORM).em.fork().getConnection();

  try {
    const observability = app.get(ObservabilityService);

    await insertApiRequestLogs({
      connection,
      requestPrefix,
      route: "/smoke/error-budget",
      okCount: 40,
      errorCount: 18
    });

    const report = await observability.errorBudget();
    const windows = Object.fromEntries(report.windows.map((window) => [window.id, window]));
    const offender = report.topOffenders.find((item) => item.route === "/smoke/error-budget");
    const ok =
      report.schemaVersion === "opspilot.error_budget.v1" &&
      ["page", "freeze"].includes(report.status) &&
      report.summary.releaseRecommendation === "freeze" &&
      report.summary.worstBurnRate >= 1 &&
      report.summary.errorBudgetRemaining < 1 &&
      windows["5m"]?.requestCount >= 58 &&
      windows["5m"]?.burnRate >= 1 &&
      windows["5m"]?.status === "freeze" &&
      windows["1h"]?.requestCount >= 58 &&
      windows["24h"]?.requestCount >= 58 &&
      offender?.errorCount === 18 &&
      report.actions.some((action) => action.verification.includes("pnpm error-budget:smoke"));

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          summary: report.summary,
          windows: report.windows,
          topOffenders: report.topOffenders.slice(0, 3),
          actions: report.actions
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Error budget smoke test failed");
    }
  } finally {
    await connection.execute("delete from api_request_logs where request_id like ?;", [`${requestPrefix}%`]);
    await app.close();
  }
}

async function insertApiRequestLogs(input: {
  connection: { execute: (sql: string, params?: unknown[]) => Promise<unknown> };
  requestPrefix: string;
  route: string;
  okCount: number;
  errorCount: number;
}) {
  const rows = [
    ...Array.from({ length: input.okCount }, (_, index) => ({
      index,
      statusCode: 200,
      durationMs: 35 + (index % 20),
      errorName: null as string | null
    })),
    ...Array.from({ length: input.errorCount }, (_, index) => ({
      index: input.okCount + index,
      statusCode: 500,
      durationMs: 320 + (index % 50),
      errorName: "SmokeInjectedFailure"
    }))
  ];

  for (const row of rows) {
    await input.connection.execute(
      `
        insert into api_request_logs (
          request_id,
          method,
          path,
          route,
          status_code,
          duration_ms,
          actor_hash,
          roles,
          team_slugs,
          user_agent,
          error_name,
          created_at
        )
        values (?, 'POST', ?, ?, ?, ?, null, '{}'::text[], '{}'::text[], 'error-budget-smoke', ?, now() - (? * interval '1 second'));
      `,
      [
        `${input.requestPrefix}-${row.index}`,
        input.route,
        input.route,
        row.statusCode,
        row.durationMs,
        row.errorName,
        row.index
      ]
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
