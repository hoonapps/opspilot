import { Migration } from "@mikro-orm/migrations";

export class Migration20260616000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql("create extension if not exists vector;");
    this.addSql("create extension if not exists pgcrypto;");

    this.addSql(`
      create table users (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        name text not null,
        roles text[] not null default '{}',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table teams (
        id uuid primary key default gen_random_uuid(),
        slug text not null unique,
        name text not null,
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table documents (
        id uuid primary key default gen_random_uuid(),
        path text not null unique,
        title text not null,
        visibility text not null check (visibility in ('public', 'team', 'restricted')),
        team_slug text null,
        metadata jsonb not null default '{}',
        content_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table document_versions (
        id uuid primary key default gen_random_uuid(),
        document_id uuid not null references documents(id) on delete cascade,
        version int not null,
        content_hash text not null,
        content text not null,
        created_at timestamptz not null default now(),
        unique (document_id, version)
      );
    `);

    this.addSql(`
      create table document_chunks (
        id uuid primary key default gen_random_uuid(),
        document_id uuid not null references documents(id) on delete cascade,
        chunk_index int not null,
        content text not null,
        embedding vector(64) not null,
        metadata jsonb not null default '{}',
        created_at timestamptz not null default now(),
        unique (document_id, chunk_index)
      );
    `);

    this.addSql("create index document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);");
    this.addSql("create index document_chunks_document_id_idx on document_chunks (document_id);");
    this.addSql("create index documents_visibility_idx on documents (visibility, team_slug);");

    this.addSql(`
      create table questions (
        id uuid primary key default gen_random_uuid(),
        text text not null,
        channel text null,
        actor jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table answers (
        id uuid primary key default gen_random_uuid(),
        question_id uuid not null references questions(id) on delete cascade,
        text text not null,
        confidence double precision not null,
        needs_human_review boolean not null,
        metadata jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table answer_sources (
        id uuid primary key default gen_random_uuid(),
        answer_id uuid not null references answers(id) on delete cascade,
        document_id uuid not null references documents(id) on delete cascade,
        chunk_id uuid not null references document_chunks(id) on delete cascade,
        score double precision not null,
        rank int not null
      );
    `);

    this.addSql(`
      create table tool_call_logs (
        id uuid primary key default gen_random_uuid(),
        question_id uuid null references questions(id) on delete set null,
        tool_name text not null,
        input jsonb not null default '{}',
        output jsonb not null default '{}',
        status text not null check (status in ('allowed', 'needs_approval', 'blocked', 'failed')),
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table approval_requests (
        id uuid primary key default gen_random_uuid(),
        question_id uuid null references questions(id) on delete set null,
        action text not null,
        reason jsonb not null default '{}',
        status text not null check (status in ('pending', 'approved', 'rejected')),
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table feedback (
        id uuid primary key default gen_random_uuid(),
        answer_id uuid not null references answers(id) on delete cascade,
        rating int not null,
        comment text null,
        created_at timestamptz not null default now()
      );
    `);

    this.addSql(`
      create table evaluation_results (
        id uuid primary key default gen_random_uuid(),
        suite_name text not null,
        metric_name text not null,
        score double precision not null,
        details jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql("drop table if exists evaluation_results;");
    this.addSql("drop table if exists feedback;");
    this.addSql("drop table if exists approval_requests;");
    this.addSql("drop table if exists tool_call_logs;");
    this.addSql("drop table if exists answer_sources;");
    this.addSql("drop table if exists answers;");
    this.addSql("drop table if exists questions;");
    this.addSql("drop table if exists document_chunks;");
    this.addSql("drop table if exists document_versions;");
    this.addSql("drop table if exists documents;");
    this.addSql("drop table if exists teams;");
    this.addSql("drop table if exists users;");
  }
}
