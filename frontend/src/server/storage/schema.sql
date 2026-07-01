-- Golden Raccoon MVP storage schema.
-- Recommended production target: Supabase Postgres.

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  target_symbol text,
  target_name text,
  target_address text,
  target_chain text,
  status text not null check (status in ('completed', 'partial', 'failed')),
  recommendation text not null,
  decision_score integer not null,
  confidence numeric not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  agent text not null,
  status text not null,
  score integer not null,
  verdict text not null,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  confidence numeric not null,
  recommended_action text not null,
  created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete set null,
  wallet_address text not null,
  action text not null,
  decision_score integer not null,
  confidence numeric not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null unique,
  type text not null,
  asset text not null,
  value_usd numeric not null default 0,
  status text not null,
  network text not null,
  user_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists user_rules (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  max_risk_score integer not null,
  max_trade_percent numeric not null,
  max_meme_exposure_percent numeric not null,
  auto_execute boolean not null default false,
  created_at timestamptz not null default now()
);
