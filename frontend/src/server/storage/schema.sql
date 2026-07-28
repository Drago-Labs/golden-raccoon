-- Golden Raccoon production storage contract.
-- Target: Supabase Postgres. This file is intentionally idempotent so the
-- MVP can apply the schema in one clean migration.

create extension if not exists pgcrypto;

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
  address_kind text not null default 'evm_account' check (address_kind in ('evm_account', 'stellar_account')),
  address text not null,
  created_at timestamptz not null default now(),
  constraint wallets_chain_identity_check check (
    (chain_family = 'evm' and address_kind = 'evm_account' and address ~* '^0x[0-9a-f]{40}$')
    or (chain_family = 'stellar' and address_kind = 'stellar_account' and address ~ '^G[A-Z2-7]{55}$')
  )
);

create table if not exists token_identities (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
  asset_kind text not null default 'evm_contract' check (asset_kind in ('evm_contract', 'stellar_native', 'stellar_classic', 'stellar_sac', 'stellar_sep41')),
  asset_key text not null,
  issuer text,
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
  created_at timestamptz not null default now(),
  constraint token_identities_chain_asset_check check (
    (chain_family = 'evm' and asset_kind = 'evm_contract' and asset_key ~ '^contract:0x[0-9a-f]{40}$')
    or
    (chain_family = 'stellar' and (
      (asset_kind = 'stellar_native' and asset_key = 'native')
      or (asset_kind = 'stellar_classic' and asset_key ~ '^classic:[A-Z0-9]{1,12}:G[A-Z2-7]{55}$' and issuer ~ '^G[A-Z2-7]{55}$')
      or (asset_kind = 'stellar_sac' and asset_key ~ '^sac:C[A-Z2-7]{55}$')
      or (asset_kind = 'stellar_sep41' and asset_key ~ '^sep41:C[A-Z2-7]{55}$')
    ))
  )
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
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
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
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
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
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
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  wallet_address text not null,
  decision_id text,
  tx_hash text not null,
  network text not null default 'legacy-evm',
  action text,
  asset text,
  value_usd numeric,
  status text not null default 'confirmed',
  auto_executed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  wallet_address text not null,
  decision_id text,
  decision_action text,
  tx_hash text not null,
  type text not null,
  asset text not null,
  value_usd numeric not null default 0,
  status text not null,
  network text not null,
  user_approved boolean not null default false,
  simulation_status text,
  policy_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transactions_chain_hash_check check (
    (chain_family = 'evm' and tx_hash ~ '^0x[0-9a-f]{64}$')
    or (chain_family = 'stellar' and tx_hash ~ '^[0-9A-Fa-f]{64}$')
  )
);

create table if not exists x402_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
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
  chain_family text not null default 'evm' check (chain_family in ('evm', 'stellar')),
  network text not null default 'legacy-evm',
  wallet_address text not null,
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
create unique index if not exists wallets_chain_network_address_uidx on wallets(chain_family, network, address);
create unique index if not exists token_identities_chain_network_asset_uidx
  on token_identities(chain_family, network, asset_key)
  where asset_key is not null;
create unique index if not exists token_identities_chain_network_identity_uidx
  on token_identities(chain_family, network, identity_key);
create unique index if not exists transactions_chain_network_hash_uidx on transactions(chain_family, network, tx_hash);
create unique index if not exists user_rules_chain_network_wallet_uidx on user_rules(chain_family, network, wallet_address);
