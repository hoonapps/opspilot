import { Migration } from "@mikro-orm/migrations";

export class Migration20260617000300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table api_request_logs (
        id uuid primary key default gen_random_uuid(),
        request_id text null,
        method text not null,
        path text not null,
        route text not null,
        status_code int not null,
        duration_ms int not null,
        actor_hash text null,
        roles text[] not null default '{}',
        team_slugs text[] not null default '{}',
        user_agent text null,
        error_name text null,
        created_at timestamptz not null default now()
      );
    `);
    this.addSql("create index api_request_logs_created_at_idx on api_request_logs (created_at desc);");
    this.addSql("create index api_request_logs_route_idx on api_request_logs (method, route, created_at desc);");
    this.addSql("create index api_request_logs_status_idx on api_request_logs (status_code, created_at desc);");
  }

  override async down(): Promise<void> {
    this.addSql("drop table if exists api_request_logs;");
  }
}
