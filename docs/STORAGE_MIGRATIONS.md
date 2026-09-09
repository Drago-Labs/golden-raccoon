# Storage Migrations, Schema Drift Detection, and Adapter Conformance

This document details the architecture, operational CLI tooling, integrity safeguards, and conformance verification layer for the Golden Raccoon storage subsystem.

---

## 1. Architecture Overview

The storage system enforces parity between in-memory testing stores (`MemoryStorageAdapter`) and production relational persistence (`PostgresStorageAdapter`).

```
                              ┌─────────────────────────────────────────┐
                              │       IStorageAdapter Interface         │
                              │  (Common Contract across all engines)  │
                              └────────────────────┬────────────────────┘
                                                   │
                       ┌───────────────────────────┴───────────────────────────┐
                       ▼                                                       ▼
        ┌─────────────────────────────┐                         ┌─────────────────────────────┐
        │    MemoryStorageAdapter     │                         │   PostgresStorageAdapter    │
        │   (Episodic / Fast Test)    │                         │    (PGlite / Production)    │
        └──────────────┬──────────────┘                         └──────────────┬──────────────┘
                       │                                                       │
                       └───────────────────────────┬───────────────────────────┘
                                                   ▼
                              ┌─────────────────────────────────────────┐
                              │        Conformance Test Suite           │
                              │   18 Standardized Lifecycle Checks      │
                              │   Strict Error Taxonomy Normalization   │
                              │   Dynamic Method Coverage Inspection    │
                              └─────────────────────────────────────────┘
```

---

## 2. Migration Runner Subsystem

The migration engine lives in `src/server/storage/migrations/runner/` and operates against any SQL executor implementing query execution.

### 2.1 Ledger Schema (`storage_migration_ledger`)

All migrations applied to Postgres are tracked in the `storage_migration_ledger` table:

| Column | Type | Description |
| :--- | :--- | :--- |
| `name` | `text PRIMARY KEY` | Canonical migration file name (e.g., `0001_baseline`) |
| `checksum` | `text NOT NULL` | SHA-256 hex digest of the forward migration file |
| `applied_at` | `timestamptz NOT NULL` | Exact timestamp of forward execution |
| `rolled_back_at` | `timestamptz` | Nullable timestamp when rolled back |
| `execution_time_ms` | `integer NOT NULL` | Duration in milliseconds |

### 2.2 Integrity Safeguards

1. **SHA-256 Checksum Enforcement**: Prior to executing new migrations, the runner computes the SHA-256 digest of every migration file and cross-references it against historical ledger records. Tampering or editing an already-applied migration triggers a `MigrationChecksumMismatchError` and immediately aborts execution.
2. **Idempotence**: Running `runner.up()` repeatedly verifies existing checksums and applies only pending migrations. Second runs produce zero side effects.
3. **Atomic Reversibility**: Every migration contains matching `.forward.sql`, `.validate.sql`, and `.rollback.sql` definitions.
4. **Lifecycle Verification**: The runner provides `verifyMigrationLifecycle()` to programmatically test forward application, validation assertions, rollback cleanup, and forward re-application.

---

## 3. Schema Drift Detection

The drift engine (`src/server/storage/migrations/runner/drift.ts`) validates that applying all migrations produces a schema structurally identical to `src/server/storage/schema.sql`.

### Comparison Logic:
1. Spawns an isolated PGlite database from `schema.sql`.
2. Spawns a parallel isolated PGlite database applying all migration scripts sequentially.
3. Introspects `information_schema.columns` and `information_schema.table_constraints`.
4. Flags any discrepancy:
   - Missing tables
   - Extraneous tables
   - Column name differences
   - Data type mismatches
   - Nullability attribute divergences

---

## 4. Storage Adapter Conformance Suite

Located in `src/server/storage/conformance/suite.ts`, the suite validates that both `MemoryStorageAdapter` and `PostgresStorageAdapter` uphold identical semantics.

### 4.1 Invariants Enforced Across Adapters:
* **Method Coverage**: Every public method declared on an adapter must possess a test case in the conformance suite. Adding an un-conformed method fails verification.
* **Error Normalization**: Unique constraint violations throw `StorageUniqueViolationError` on both adapters. Unmapped driver errors are forbidden.
* **Ordering Guarantee**: Cursor and temporal listings guarantee exact descending `created_at` or block ordering.
* **Nullability Invariance**: Undefined or null attributes maintain identical key retention and shape across adapters.
* **Domain Model Safety**: Route handlers and domain models remain decoupled from storage implementations.

---

## 5. CLI Reference Commands

All commands are executed from the `frontend/` directory:

| Command | Action |
| :--- | :--- |
| `npm run storage:migrate status` | Inspects migration status and ledger checksums |
| `npm run storage:migrate up` | Applies all pending migrations in version order |
| `npm run storage:migrate down` | Rolls back the latest applied migration |
| `npm run storage:migrate verify` | Executes full lifecycle verification (forward -> validate -> rollback -> re-apply) |
| `npm run storage:drift` | Runs AST schema drift detection against `schema.sql` |
| `npm run storage:conformance` | Executes the 18/18 conformance checks and 4 divergence detectors |
| `npm test` | Runs the full Vitest suite including observability and storage conformance |
