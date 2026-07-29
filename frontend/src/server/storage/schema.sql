-- Golden Raccoon production storage contract.
-- Target: Supabase Postgres. This file is intentionally idempotent so the
-- MVP can apply the schema in one clean migration.

create extension if not exists pgcrypto;

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists token_identities (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  wallet_address text,
  contract_address text,
  chain text,
  symbol text,
  token_name text,
  website_url text,
  twitter_url text,
  telegram_url text,
  coingecko_id text,
  dex_screener_pair_url text,
  confidence numeric not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  mode text check (mode in ('portfolio_review', 'token_scan', 'pre_buy_check', 'holding_review', 'execution_prepare')),
  input_snapshot jsonb not null default '{}'::jsonb,
  target_symbol text,
  target_name text,
  target_address text,
  target_chain text,
  status text not null check (status in ('completed', 'partial', 'failed')),
  recommendation text not null,
  decision_score integer not null,
  confidence numeric not null,
  summary text not null,
  source_statuses jsonb not null default '[]'::jsonb,
  user_action text not null default 'pending' check (user_action in ('pending', 'approved', 'rejected', 'adjusted', 'executed')),
  created_at timestamptz not null default now()
);

create table if not exists agent_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  agent text not null,
  status text not null,
  risk_score integer not null,
  risk_level text not null,
  verdict text not null,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  confidence numeric not null,
  recommended_action text not null,
  blocking_reasons jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  raw_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  result_id uuid references agent_results(id) on delete cascade,
  agent text not null,
  label text not null,
  url text,
  status text not null,
  checked_at timestamptz,
  latency_ms integer,
  reliability numeric,
  error text,
  raw jsonb not null default '{}'::jsonb,
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
  decision_explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  decision_id text,
  tx_hash text not null,
  network text,
  action text,
  asset text,
  value_usd numeric,
  status text not null default 'confirmed',
  auto_executed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  decision_id text,
  decision_action text,
  tx_hash text not null unique,
  type text not null,
  asset text not null,
  value_usd numeric not null default 0,
  status text not null,
  network text not null,
  user_approved boolean not null default false,
  simulation_status text,
  policy_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists x402_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  payment_header_hash text not null unique,
  wallet_address text,
  payer text,
  transaction_hash text,
  network text not null,
  asset text not null,
  amount text not null,
  price_usd text not null,
  pay_to text not null,
  facilitator_url text not null,
  protected_resource text not null,
  request_body_hash text not null,
  verification_status text not null check (verification_status in ('payment_required', 'verified', 'settled', 'failed', 'duplicate', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_rules (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  max_risk_score integer not null,
  max_trade_percent numeric not null,
  max_meme_exposure_percent numeric not null,
  max_daily_transaction_value_usd numeric not null default 1000,
  max_slippage_bps integer not null default 100,
  allowed_chains jsonb not null default '[]'::jsonb,
  blocked_tokens jsonb not null default '[]'::jsonb,
  allowed_actions jsonb not null default '[]'::jsonb,
  auto_execute boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists watchlist_entries (
  id text primary key,
  wallet_address text not null,
  chain_family text not null check (chain_family in ('evm', 'stellar')),
  network text not null,
  asset_identifier text not null,
  asset_type text not null check (asset_type in ('evm_contract', 'stellar_native', 'stellar_classic', 'stellar_contract')),
  symbol text not null,
  name text not null,
  latest_scan_id text,
  previous_scan_id text,
  latest_scan_at timestamptz,
  latest_scan_status text check (latest_scan_status in ('complete', 'partial', 'unavailable', 'stale', 'failed')),
  latest_verdict text,
  latest_risk_score integer,
  previous_scan_available boolean not null default false,
  sep41_contract boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists watchlist_scan_records (
  id text primary key,
  watchlist_entry_id text not null references watchlist_entries(id) on delete cascade,
  wallet_address text not null,
  chain_family text not null,
  network text not null,
  asset_identifier text not null,
  asset_type text not null,
  query text not null,
  symbol text not null,
  status text not null check (status in ('complete', 'partial', 'unavailable', 'stale', 'failed')),
  verdict text,
  risk_score integer,
  confidence numeric,
  summary text,
  risk_report_id text,
  data_quality_mode text check (data_quality_mode in ('live', 'partial', 'unavailable', 'stale', 'conflicting')),
  failure_reason text,
  scan_completed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_wallet_created_idx on agent_runs(wallet_address, created_at desc);
create index if not exists agent_results_run_agent_idx on agent_results(run_id, agent);
create index if not exists source_snapshots_run_agent_idx on source_snapshots(run_id, agent);
create index if not exists recommendations_wallet_created_idx on recommendations(wallet_address, created_at desc);
create index if not exists transactions_wallet_created_idx on transactions(wallet_address, created_at desc);
create index if not exists approvals_wallet_created_idx on approvals(wallet_address, created_at desc);
create index if not exists x402_payment_receipts_resource_created_idx on x402_payment_receipts(protected_resource, created_at desc);
create unique index if not exists watchlist_entries_identity_uidx
  on watchlist_entries(wallet_address, chain_family, network, asset_identifier);
create index if not exists watchlist_entries_wallet_updated_idx
  on watchlist_entries(wallet_address, updated_at desc);
create index if not exists watchlist_scan_records_entry_created_idx
  on watchlist_scan_records(watchlist_entry_id, created_at desc);
