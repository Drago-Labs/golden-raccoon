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

create index if not exists agent_runs_wallet_created_idx on agent_runs(wallet_address, created_at desc);
create index if not exists agent_results_run_agent_idx on agent_results(run_id, agent);
create index if not exists source_snapshots_run_agent_idx on source_snapshots(run_id, agent);
create index if not exists recommendations_wallet_created_idx on recommendations(wallet_address, created_at desc);
create index if not exists transactions_wallet_created_idx on transactions(wallet_address, created_at desc);
create index if not exists approvals_wallet_created_idx on approvals(wallet_address, created_at desc);
create index if not exists x402_payment_receipts_resource_created_idx on x402_payment_receipts(protected_resource, created_at desc);

-- ─── Discovery service tables ────────────────────────────────────────────────

create table if not exists discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  chain_family text not null check (chain_family in ('evm', 'stellar')),
  chain_id text not null,
  address text not null,
  asset_key text not null,
  symbol text,
  token_name text,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  observation_count integer not null default 1,
  latest_market jsonb not null default '{}'::jsonb,
  latest_evidence jsonb not null default '[]'::jsonb,
  latest_risk_score integer,
  latest_risk_level text check (latest_risk_level in ('low', 'medium', 'high', 'critical', null)),
  last_observed_by text not null check (last_observed_by in ('dexscreener_new_pairs', 'stellar_market'))
);

create table if not exists discovery_observations (
  id uuid primary key default gen_random_uuid(),
  observation_ext_id text not null unique,
  canonical_key text not null,
  chain_family text not null,
  chain_id text not null,
  address text not null,
  asset_key text not null,
  symbol text,
  token_name text,
  observed_by text not null check (observed_by in ('dexscreener_new_pairs', 'stellar_market')),
  observed_at timestamptz not null,
  market jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  risk_score integer,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical', null)),
  created_at timestamptz not null default now()
);

create table if not exists discovery_cursors (
  id uuid primary key default gen_random_uuid(),
  provider_kind text not null,
  chain_id text not null,
  cursor text not null,
  updated_at timestamptz not null,
  consecutive_failures integer not null default 0,
  next_allowed_poll_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(provider_kind, chain_id)
);

create index if not exists discovery_candidates_canonical_key_idx on discovery_candidates(canonical_key);
create index if not exists discovery_candidates_chain_id_idx on discovery_candidates(chain_id);
create index if not exists discovery_candidates_last_observed_at_idx on discovery_candidates(last_observed_at desc);
create index if not exists discovery_observations_canonical_key_idx on discovery_observations(canonical_key);
create index if not exists discovery_observations_observed_at_idx on discovery_observations(observed_at desc);
create index if not exists discovery_cursors_provider_chain_idx on discovery_cursors(provider_kind, chain_id);

-- ─── Risk registry publication history ─────────────────────────────────────────

create table if not exists risk_publications (
  id text primary key,
  network text not null check (network in ('stellar-testnet', 'stellar-pubnet')),
  tx_hash text not null,
  publisher text not null,
  asset_key text not null,
  asset_label text not null,
  score integer not null,
  verdict text not null,
  report_hash text not null,
  verified boolean not null default false,
  hash_match boolean,
  ledger integer,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(network, tx_hash)
);

create index if not exists risk_publications_network_created_idx on risk_publications(network, created_at desc);
create index if not exists risk_publications_publisher_idx on risk_publications(publisher);
create index if not exists risk_publications_asset_key_idx on risk_publications(asset_key);

