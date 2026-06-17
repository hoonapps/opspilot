import { Migration } from "@mikro-orm/migrations";

export class Migration20260618000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table document_revalidation_runs (
        id uuid primary key default gen_random_uuid(),
        document_id uuid not null references documents(id) on delete cascade,
        answer_id uuid not null references answers(id) on delete cascade,
        question_id uuid null references questions(id) on delete set null,
        status text not null check (status in ('cleared', 'needs_review', 'blocked')),
        recommended_action text not null check (recommended_action in ('close_queue_item', 'assign_human_reviewer', 'block_answer_and_rewrite')),
        actor jsonb not null default '{}',
        queue_item jsonb not null,
        decision jsonb not null,
        summary jsonb not null,
        checks jsonb not null,
        evidence_links jsonb not null,
        artifact_hashes jsonb not null default '{}',
        report_hash text not null,
        created_at timestamptz not null default now()
      );
    `);
    this.addSql("create index document_revalidation_runs_document_idx on document_revalidation_runs (document_id, created_at desc);");
    this.addSql("create index document_revalidation_runs_answer_idx on document_revalidation_runs (answer_id, created_at desc);");
    this.addSql("create index document_revalidation_runs_status_idx on document_revalidation_runs (status, created_at desc);");
  }

  override async down(): Promise<void> {
    this.addSql("drop table if exists document_revalidation_runs;");
  }
}
