-- Migration 0002: Create migration ledger
create table if not exists migration_ledger (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now(),
  execution_time_ms integer not null default 0
);
