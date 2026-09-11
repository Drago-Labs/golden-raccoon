CREATE TABLE IF NOT EXISTS x402_settlements (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  protected_resource TEXT NOT NULL,
  request_body_hash TEXT NOT NULL,
  chain_family TEXT NOT NULL,
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  canonical_asset TEXT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  pay_to TEXT NOT NULL,
  payer_raw TEXT,
  payer_redacted TEXT,
  transaction_hash TEXT,
  binding_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  price_quoted TEXT,
  owed BOOLEAN NOT NULL DEFAULT FALSE,
  work_id TEXT,
  receipt_id TEXT,
  result_hash TEXT,
  failure_reason TEXT,
  reconciliation JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x402_settlements_status ON x402_settlements (status);
CREATE INDEX IF NOT EXISTS idx_x402_settlements_owed ON x402_settlements (owed);
CREATE INDEX IF NOT EXISTS idx_x402_settlements_payer ON x402_settlements (payer_raw);
CREATE INDEX IF NOT EXISTS idx_x402_settlements_resource ON x402_settlements (protected_resource);

CREATE TABLE IF NOT EXISTS x402_consumed_proofs (
  proof_hash TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  chain_family TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS x402_receipts (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES x402_settlements(id),
  resource TEXT NOT NULL,
  payer TEXT,
  payer_redacted TEXT,
  result JSONB NOT NULL,
  result_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  last_redeemed_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_x402_receipts_settlement ON x402_receipts (settlement_id);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_resource ON x402_receipts (resource);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_expires_at ON x402_receipts (expires_at);

CREATE TABLE IF NOT EXISTS x402_quotes (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  price_usd TEXT NOT NULL,
  amount TEXT NOT NULL,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_family TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_x402_quotes_expires_at ON x402_quotes (expires_at);

CREATE TABLE IF NOT EXISTS x402_payer_usage (
  payer TEXT NOT NULL,
  chain_family TEXT NOT NULL,
  payer_redacted TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_spend_by_asset JSONB NOT NULL DEFAULT '{}'::jsonb,
  settlements_count INTEGER NOT NULL DEFAULT 0,
  successful_scans INTEGER NOT NULL DEFAULT 0,
  failed_scans INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (payer, chain_family)
);
