# Operator Privacy Procedures, Retention Policy, and Deletion Workflow

This document details the operational procedures, retention defaults, privacy controls, export formats, and deletion workflows for Golden Raccoon maintainers and operators.

---

## 1. Stored Data Inventory & Classification Matrix

| Component / Table | Fields / Data Contained | Sensitivity | Purpose | Retention Window | Deletion / Lifecycle Behavior |
| --- | --- | --- | --- | --- | --- |
| **`wallets`** | `id`, `address`, `created_at` | Public Identifier | Wallet session & identity lookup | Account Lifetime | **Hard Delete** on user deletion |
| **`agent_runs`** | `wallet_address`, `input_snapshot`, `target_*`, `summary` | High | Agent evaluation & scan history | Configurable (Default: 90 days) | **Hard Delete** (cascades `agent_results`, `source_snapshots`) |
| **`agent_results`** | `run_id`, `agent`, `findings`, `sources`, `raw_signals` | High | Agent risk scoring telemetry | Configurable (Default: 90 days) | **Hard Delete** via cascade |
| **`source_snapshots`** | `run_id`, `result_id`, `url`, `error`, `raw` | Medium | Provider API snapshots | Configurable (Default: 90 days) | **Hard Delete** via cascade |
| **`recommendations`** | `wallet_address`, `action`, `decision_explanation` | High | Trading advice & strategy rationale | Configurable (Default: 90 days) | **Hard Delete** on deletion request or retention expiry |
| **`approvals`** | `wallet_address`, `tx_hash`, `asset`, `value_usd` | High | Recorded user transaction approvals | Configurable (Default: 180 days) | **Hard Delete** on deletion request |
| **`transactions`** | `wallet_address`, `tx_hash`, `source_account`, `policy_status` | High | Onchain execution tracking & audit | Configurable (Default: 365 days) | **Irreversible Unlinking** (`wallet_address = NULL`, `source_account = NULL`) |
| **`x402_payment_receipts`** | `wallet_address`, `payer`, `tx_hash`, `request_body_hash` | High | Settlement receipt & payment verification | Configurable (Default: 1095 days / 3 yrs) | **Irreversible Unlinking** (`wallet_address = NULL`, `payer = NULL`) |
| **`user_rules`** | `wallet_address`, `max_risk_score`, `blocked_tokens` | Medium | Custom execution policy rules | Account Lifetime | **Hard Delete** on user deletion |
| **`alert_rules`** | `wallet_address`, `trigger_type`, `threshold` | Medium | Wallet monitoring definitions | Account Lifetime | **Hard Delete** (cascades `alerts`, `alert_deliveries`) |
| **`alert_observations`** | `wallet_address`, `observation_key`, `evidence` | Medium | Signal observations extracted from runs | Configurable (Default: 30 days) | **Hard Delete** on deletion request or retention expiry |
| **`alerts`** | `wallet_address`, `message`, `evidence_*` | Medium | Triggered notification history | Configurable (Default: 90 days) | **Hard Delete** via cascade |
| **`alert_deliveries`** | `wallet_address`, `sanitized_payload` | Medium | Delivery audit logs per channel | Configurable (Default: 90 days) | **Hard Delete** via cascade |
| **`watchlist_entries`** | `wallet_address`, `identity_key`, `note` | Medium | Watched token & contract list | Account Lifetime | **Hard Delete** (cascades `watchlist_scan_runs`) |
| **`watchlist_scan_runs`** | `wallet_address`, `classification`, `risk_report` | Medium | Scheduled watchlist scans | Configurable (Default: 90 days) | **Hard Delete** via cascade |
| **`discovery_alerts`** | `wallet_address`, `title`, `detail` | Medium | Discovery notifications | Configurable (Default: 90 days) | **Hard Delete** on deletion request |
| **In-Memory Caches** | `portfolioCache`, API strategy headers | High | Portfolio snapshot caching | 30 seconds TTL | **Synchronous Eviction** on deletion request |
| **Logs & Telemetry** | Structured console logs | High | Operational debugging | 14 days | **In-Flight Redaction** of EVM (`0x...`) & Stellar (`G...`) addresses |
| **Onchain State** | EVM & Stellar Blockchains | Public Ledger | Smart contract transactions | Immutable | **Public Onchain Records** (Immutable, unmanaged by server) |

---

## 2. Retention Configuration Options

The retention policy engine is configured via the following environment variables:

```bash
# Agent runs and evaluation telemetry retention (days)
RETENTION_AGENT_RUNS_DAYS=90

# Alert engine raw signal observation retention (days)
RETENTION_ALERT_OBSERVATIONS_DAYS=30

# Alert history notification retention (days)
RETENTION_ALERTS_DAYS=90

# Watchlist scan runs retention (days)
RETENTION_WATCHLIST_RUNS_DAYS=90

# Execution audit transaction unlinking threshold (days)
RETENTION_TRANSACTIONS_UNLINK_DAYS=365

# X402 payment receipt unlinking threshold for accounting audit compliance (days)
RETENTION_X402_RECEIPTS_UNLINK_DAYS=1095
```

---

## 3. Operator Execution Procedures

### 3.1 Authenticated User Data Export
When an authenticated user requests a copy of their stored data:
1. Client makes `GET /api/wallet-privacy/export` or `POST /api/wallet-privacy/export` with an active wallet session cookie (`gr_wallet_session`).
2. The server verifies the wallet session challenge and returns a portable JSON document containing all user-bound records across memory adapters and Postgres SQL tables.

### 3.2 Authenticated User Deletion & Irreversible Unlinking
When an authenticated user requests deletion of their account:
1. Client makes `DELETE /api/wallet-privacy/delete` or `POST /api/wallet-privacy/delete` with an active wallet session cookie.
2. The server:
   - Evicts all cached portfolio items for the wallet (`clearPortfolioCacheForWallet`).
   - Removes user application rows from memory stores and Postgres database (`agent_runs`, `alert_rules`, `watchlist_entries`, `user_rules`, `recommendations`, `approvals`).
   - Performs **Irreversible Unlinking** on financial audit tables (`transactions` and `x402_payment_receipts`), setting `wallet_address = NULL` and `source_account = NULL` / `payer = NULL`.
3. If an error occurs, the endpoint returns `{ ok: false, partialFailure: true, retryable: true }`. Retrying the request safely completes any remaining steps idempotently.

---

## 4. User-Facing Limitations and Disclosures

### 4.1 Onchain Ledger Immutability
Golden Raccoon cannot alter or delete transaction records, smart contract interactions, or balances recorded on public blockchain ledgers (EVM mainnet/testnets or Stellar pubnet/testnet). These are public, immutable records.

### 4.2 Financial & Accounting Audit Compliance
Certain financial records (`x402_payment_receipts` and `transactions`) are preserved for mandatory tax, accounting, and legal audit compliance (3-year or 7-year retention windows). To protect user privacy, these records are **irreversibly unlinked** from user wallet identities so they cannot be linked back to the user's account context.

---

## 5. Verification and Rollback Procedure

To verify privacy and deletion behavior:
```bash
# Run the privacy lifecycle test suite
npm run test:privacy
```

To roll back a deployment:
- No database schema migrations destroy data. Unlinking sets `wallet_address = NULL` irreversibly for unlinked audit records as intended by policy.
