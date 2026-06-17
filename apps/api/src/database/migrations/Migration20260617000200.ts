import { Migration } from "@mikro-orm/migrations";

export class Migration20260617000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table ask_idempotency_keys (
        id uuid primary key default gen_random_uuid(),
        scope_hash text not null,
        idempotency_key text not null,
        request_hash text not null,
        response jsonb null,
        status text not null check (status in ('in_progress', 'completed', 'failed')),
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        unique (scope_hash, idempotency_key)
      );
    `);
    this.addSql("create index ask_idempotency_keys_expires_at_idx on ask_idempotency_keys (expires_at);");
  }

  override async down(): Promise<void> {
    this.addSql("drop table if exists ask_idempotency_keys;");
  }
}
