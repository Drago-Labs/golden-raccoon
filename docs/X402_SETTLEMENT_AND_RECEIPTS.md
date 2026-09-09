# x402 Usage Metering, Entitlements, and Verifiable Settlement Receipts

## Overview

This document specifies the x402 usage metering, entitlement quotas, verifiable settlement receipts, and unified cross-chain settlement lifecycle implemented for issue #193.

The implementation preserves the shared storage schema (`src/server/storage.ts`) and adapter contract without modification, housing all settlement records, receipts, time-locked quotes, and proof consumption tracking inside a dedicated persistence module (`src/server/x402/store/`).

---

## Architectural Principles

1. **Storage Decoupling**: Settlement records, proofs, quotes, and receipts reside in `src/server/x402/store/` with dual-write Postgres persistence (`x402_settlements.sql`) and an in-memory thread-safe fallback. The shared storage schema contract remains unchanged.
2. **Unified Contract Suite**: Both EVM and Stellar chain schemes satisfy a single settlement contract specification (`UniversalSettlementContract`), providing deterministic parity across blockchain architectures.
3. **Atomic Replay Prevention**: Proof presentation runs through `ProofConsumer` with mutex serialization, guaranteeing single consumption under sequential and concurrent traffic.
4. **Verifiable Receipts**: Receipts carry cryptographic HMAC-SHA256 signatures, retention window expiration, and strict resource boundary binding.
5. **Entitlement & Quota Enforcer**: Enforces sliding window request and spend caps per payer across EVM and Stellar.
6. **Time-Locked Pricing**: The pricing engine locks quotes for defined TTL windows. Payments presented with a valid quote lock price even if live prices shift.
7. **Failure State & Refund Lifecycle**: Downstream processing errors transition settlements to an `owed` state, visible in refund queries and settled via idempotent refund transitions.

---

## Architecture Diagram

```
                 +--------------------------------------+
                 |          x402 Client Request         |
                 +-------------------+------------------+
                                     |
                    +----------------v----------------+
                    |        Terms & Pricing          |
                    |    (GET/POST /api/x402/terms)   |
                    +----------------+----------------+
                                     |
                    +----------------v----------------+
                    |       Quota Enforcer Gate       |
                    |   (Sliding Window Check/Debit)  |
                    +----------------+----------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
+-----------------------------+             +-----------------------------+
|    EVM Settlement Flow      |             |   Stellar Settlement Flow   |
|   (/api/x402/deep-scan)     |             | (/api/x402/stellar-deep-scan)|
+--------------+--------------+             +--------------+--------------+
               |                                           |
               +---------------------+---------------------+
                                     |
                    +----------------v----------------+
                    |  Universal Settlement Contract  |
                    |        (begin settlement)       |
                    +----------------+----------------+
                                     |
                    +----------------v----------------+
                    |         Proof Consumer          |
                    |   (Mutex-locked SHA-256 Proof)  |
                    +----------------+----------------+
                                     |
                    +----------------v----------------+
                    |     Execute Protected Work      |
                    +----------------+----------------+
                                     |
                   +-----------------+-----------------+
                   |                                   |
            (Work Succeeds)                     (Work Fails)
                   |                                   |
        +----------v----------+             +----------v----------+
        |   Issue Verifiable  |             | Transition to Owed  |
        |       Receipt       |             |   Settlement State  |
        |  (HMAC-SHA256 Sign) |             | (recordWorkFailure) |
        +----------+----------+             +----------+----------+
                   |                                   |
        +----------v----------+             +----------v----------+
        |  Redeem / Inspect   |             |   Process Refund    |
        |  (/api/x402/receipts|             | (/api/x402/         |
        |         /:id)       |             |    settlements)     |
        +---------------------+             +---------------------+
```

---

## Module Specifications

### 1. Persistence Module (`src/server/x402/store/`)

| File | Responsibilities |
|---|---|
| `store.ts` | Interface definitions: `X402Store`, `StoredReceipt`, `StoredProof`, `StoredQuote`, `StoredUsage` |
| `memory.ts` | `MemoryX402Store`: Mutex-serialized in-memory store for development and testing |
| `sql.ts` | `SqlX402Store`: Dual-write PostgreSQL store with auto-fallback to memory |
| `x402_settlements.sql` | Production schema for receipts, proofs, quotes, settlements, and usage metering |

#### Schema Overview

- `x402_receipts`: Primary receipt storage with HMAC signature, payload hash, expiration, and redemption counter.
- `x402_consumed_proofs`: Consumed proof registry indexed on unique proof hashes.
- `x402_quotes`: Issued time-locked price quotes with resource and network parameters.
- `x402_settlements`: Settlement ledger records tracking `required -> pending -> served -> owed -> refunded`.
- `x402_usage_metering`: Per-payer sliding window request counts and spend totals.

---

### 2. Usage Metering & Quota Enforcer (`src/server/x402/metering/`)

#### Pricing Engine (`pricing.ts`)
- Generates quotes with unique identifier prefix `quot_`.
- Time-locks price for quote duration (`quoteTtlSeconds`, default 300 seconds).
- Payment verification honors locked quote price even if live prices change.

#### Quota Enforcer (`quota.ts`)
- Maintains per-payer sliding window quotas (`maxRequests`, `maxSpendUsd`, `windowSeconds`).
- Rejects requests exceeding request or spend limits before execution begins.
- Records requests and spend aggregates atomically.

#### Usage Tracker (`usage.ts`)
- Aggregates payer requests and cumulative spend.
- Provides `reconcileWithLedger` to verify usage records against completed settlement records in the ledger.

---

### 3. Settlement Contract & Receipts (`src/server/x402/settlement/`)

#### Proof Consumer (`consume.ts`)
- Derives canonical SHA-256 hash from proof payload.
- Acquires mutex lock before state inspection.
- Rejects duplicate presentations with `ProofAlreadyConsumedError`.
- Verified under concurrent load (10 simultaneous presentations yields exactly 1 success and 9 rejections).

#### Receipt Manager (`receipts.ts`)
- Issues receipts carrying cryptographic HMAC-SHA256 signature calculated across `id:settlementId:resource:resultHash:expiresAt`.
- Enforces retention expiration window (`receiptRetentionSeconds`, default 86400 seconds / 24 hours).
- Enforces resource boundaries: attempting to redeem a receipt issued for `/api/x402/deep-scan` against `/api/x402/other` throws `ResourceMismatchError`.

#### Universal Settlement Contract (`contract.ts`)
- Implements `SettlementContract` interface.
- Executes identical lifecycle across EVM (`evmSettlementContract`) and Stellar (`stellarSettlementContract`):
  1. `begin(request, quoteId)`: Validates quote, checks quota, records settlement.
  2. `consumeProof(proof, settlementId)`: Atomically verifies and burns proof.
  3. `deliverWork(idempotencyKey, resource, result, payer)`: Marks settlement served, records usage, issues verifiable receipt.
  4. `recordWorkFailure(idempotencyKey, reason)`: Marks settlement as `owed`.
  5. `redeemReceipt(receiptId, resource)`: Verifies signature, retention, and boundary, then returns result.
  6. `getOwedRefunds()`: Queries settlements requiring reimbursement.
  7. `processRefund(idempotencyKey)`: Finalizes refund transition.

---

## API Endpoints

### 1. Terms & Quotes (`/api/x402/terms`)

- **`GET /api/x402/terms`**: Returns current terms, retention policies, and available networks.
- **`GET /api/x402/terms?quoteId=<id>`**: Validates and returns details for a locked quote.
- **`POST /api/x402/terms`**: Issues a new time-locked price quote.
  ```json
  {
    "resource": "/api/x402/deep-scan",
    "chainFamily": "evm",
    "network": "eip155:8453",
    "asset": "USDC",
    "payTo": "0x1111111111111111111111111111111111111111"
  }
  ```

### 2. Receipt Inspection & Redemption (`/api/x402/receipts/[id]`)

- **`GET /api/x402/receipts/<id>`**: Returns receipt metadata without redeeming.
- **`GET /api/x402/receipts/<id>?resource=/api/x402/deep-scan`**: Verifies signature, validates resource boundary, checks retention window, increments redemption count, and returns original execution result.

### 3. Settlement Query & Refunds (`/api/x402/settlements`)

- **`GET /api/x402/settlements`**: Returns settlement records with payer addresses redacted.
- **`GET /api/x402/settlements?owed=true`**: Returns settlements marked as `owed` due to downstream execution failures.
- **`POST /api/x402/settlements`**: Processes a refund for an owed settlement.
  ```json
  {
    "action": "refund",
    "idempotencyKey": "chk_fail_1725850000000"
  }
  ```

---

## Payer Privacy Invariant

Raw payer addresses are never exposed in public settlement query responses. All records serialize with `payerRedacted` (e.g. `0x1111...0000` or `GBBD...LA5`). Internal reconciliation mechanisms retain access to unredacted hashes exclusively within server-side memory for accounting audits.

---

## Test Coverage Summary

| Test Suite | Target | Test Cases |
|---|---|---|
| `pricing.test.ts` | Pricing Engine | Locked quote honoring, price drift tolerance, expiration/mismatch rejection |
| `replay.test.ts` | Proof Consumer | Sequential replay rejection, concurrent race condition prevention (10 threads) |
| `receipts.test.ts` | Receipt Manager | Valid issuance, HMAC verification, retention expiration, resource boundary isolation |
| `refund.test.ts` | Settlement Ledger | Failure-to-owed transition, owed listing, idempotent refund settlement |
| `settlement.contract.test.ts` | Universal Settlement Contract | Parity across EVM and Stellar schemes for complete lifecycle |
| `metering.test.ts` | Quota & Metering | Request and spend quotas, sliding window enforcement, ledger reconciliation |
| `api.routes.test.ts` | Next.js API Routes | Route integration for terms, quotes, receipts, settlements, and refunds |
| `ledger.test.ts` | Settlement Ledger | Core idempotency, conflict rejection, expiry handling |
