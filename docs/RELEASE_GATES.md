# Machine-Checkable Release Readiness Gates

This document defines the automated, machine-checkable gate system governing release readiness for Golden Raccoon deployments.

## Overview

Human trust and informal pre-flight checkoffs are replaced by automated gate evaluation and cryptographically bound evidence. A release candidate cannot be marked ready or promoted unless all critical gates pass and the resulting evidence artifact verifies cleanly against the target commit SHA.

```
+-------------------------------------------------------------------------+
|                        Readiness Gate Registry                          |
+-------------------------------------------------------------------------+
| [CRITICAL] rollback          -> Switches, rehearsal automation, docs    |
| [CRITICAL] emergencyPause    -> Contracts, pause hooks, rehearsal       |
| [CRITICAL] smoke             -> Critical routes, structured JSON output |
| [CRITICAL] load              -> Concurrency tests, performance budgets  |
| [CRITICAL] deploymentRecord  -> docs/deployments completeness           |
| [WARNING]  budgets           -> SLO error budget thresholds             |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                     Aggregate Verdict: READY / BLOCKED                  |
|        Digest: SHA-256(canonicalizeJson(verdict)) bound to Commit       |
+-------------------------------------------------------------------------+
                                    |
        +---------------------------+---------------------------+
        |                                                       |
        v                                                       v
+------------------------------+             +------------------------------+
|   Evidence Verification CI   |             |   Operations Dashboard UI    |
| (Fails if tampered/mismatched)             |  (/operations & /api route)  |
+------------------------------+             +------------------------------+
```

## Gate Definitions

### 1. Rollback Capability & Rehearsal (`rollback`)
- **Severity**: Critical
- **Purpose**: Verifies that emergency traffic switching, recommendation-only fallback, and provider disable switches are functional.
- **Checked Invariants**:
  - `docs/security/rollback-procedure.md` exists and documents DNS/traffic switching.
  - `scripts/rehearse-rollback.mjs` exists, executes, and passes.
  - Runtime environment switches declared: `RECOMMENDATION_ONLY_MODE`, `DISABLE_EXECUTION_PROVIDERS`, `DISABLE_EVM_SUBMISSION`, `DISABLE_STELLAR_SUBMISSION`, `DISABLE_SUPABASE_WRITES`.

### 2. Emergency Pause Rehearsal (`emergencyPause`)
- **Severity**: Critical
- **Purpose**: Verifies smart contract emergency pause triggers and on-chain circuit breaker mechanisms.
- **Checked Invariants**:
  - `docs/security/emergency-pause-procedure.md` exists and details emergency response commands (`cast send`, `stellar contract invoke`).
  - `scripts/rehearse-emergency-pause.mjs` exists, executes, and passes.
  - `GoldRaccoonPolicy.sol` implements `emergencyPause` and `paused` state inspection.
  - Runbook `RB-007` registered in observability runbook dictionary.

### 3. Critical Route Smoke Coverage (`smoke`)
- **Severity**: Critical
- **Purpose**: Verifies that essential application routes are implemented and that smoke tests emit structured, comparable output.
- **Checked Invariants**:
  - Critical routes exist: `/api/health`, `/api/x402/deep-scan`, `/api/history/agent-runs`, `/api/operations/readiness`, `/api/execute/prepare`.
  - `scripts/smoke-api.mjs` exists and supports `--json` structured reporting.
  - Per-route latency budgets recorded and enforced.

### 4. Load Behaviour Against Recorded Budgets (`load`)
- **Severity**: Critical
- **Purpose**: Exercises execution and simulation paths under concurrent load and verifies latency and error rate baselines.
- **Checked Invariants**:
  - `scripts/load-test-execution.mjs` and `scripts/load-test-simulation.mjs` exist and support `--json`.
  - `docs/PERFORMANCE_BUDGETS.md` exists and records baseline thresholds.
  - Success rate thresholds enforced: >= 95% for execution flow, >= 90% for simulation flow.

### 5. Deployment Record Completeness (`deploymentRecord`)
- **Severity**: Critical
- **Purpose**: Ensures that deployments to staging or production are accompanied by an immutable record in `docs/deployments/`.
- **Checked Invariants**:
  - `docs/deployments/TEMPLATE.md` exists.
  - For target environments `production` or `mainnet`, an environment-specific deployment record must exist and must not contain unpopulated template placeholders (`<chain>`, `<address>`).

### 6. SLO Error Budget Compliance (`budgets`)
- **Severity**: Warning
- **Purpose**: Ensures SLO error budget definitions and monitoring modules are registered.
- **Checked Invariants**:
  - `docs/SLO_ERROR_BUDGETS.md` exists.
  - Observability module `frontend/src/server/observability/slo.ts` tracks multi-window burn rates.
  - Runbook `RB-008` registered for blocked release gates.

## Verdict Aggregation

Gates are evaluated sequentially. Results are aggregated into a single `VerdictReport`:
- **Ready**: Zero critical gate failures.
- **Blocked**: One or more critical gate failures.

Warnings do not block deployment independently, but are prominently highlighted in the verdict report, UI, and API.

## Cryptographic Evidence Artifact

When running with `--generate-evidence`, the gate runner emits a verifiable artifact:

```json
{
  "schemaVersion": "1.0.0",
  "commitSha": "e43b174...",
  "environment": "testnet",
  "generatedAt": "2026-09-09T03:30:00.000Z",
  "verdict": {
    "verdict": "ready",
    "commitSha": "e43b174...",
    "environment": "testnet",
    "evaluatedAt": "2026-09-09T03:30:00.000Z",
    "summary": {
      "total": 6,
      "passed": 6,
      "failed": 0,
      "skipped": 0,
      "criticalFailures": 0,
      "warnings": 0
    },
    "gates": [ ... ],
    "reasons": []
  },
  "digest": "9f83... (SHA-256 hex string)"
}
```

### Digest Calculation & Tamper Resistance
1. The `verdict` object is serialized into canonical JSON using RFC 8785 deterministic key sorting (`canonicalizeJson`).
2. The SHA-256 hash of the canonical JSON string is computed as hex.
3. The resulting digest binds the entire evaluation state to `commitSha`.
4. Verification (`--verify-evidence <path>`):
   - Computes SHA-256 over `artifact.verdict`.
   - Confirms computed digest matches `artifact.digest`.
   - Confirms `artifact.commitSha` matches the current commit.
   - Confirms `artifact.verdict.verdict === "ready"`.
   - Any manual modification of gates, summary, or commit SHA invalidates the digest and causes immediate exit code 1.

## Operations View & API

- **Web Dashboard**: Located at `/operations` under "Machine-Checkable Release Gates". Displays real-time aggregate verdict badge (`READY` vs `BLOCKED`), commit SHA, gate summary counts, and each gate's status and failure reason.
- **REST Endpoint**: `GET /api/operations/readiness?env=<env>&commit=<sha>` returns the complete `VerdictReport` JSON for integration into deployment pipelines.

## CLI Usage

```sh
# Evaluate all gates against current working directory
node scripts/release-gate.mjs

# Evaluate against a specific environment (e.g. testnet, staging, production)
node scripts/release-gate.mjs --environment testnet

# Emit structured JSON output
node scripts/release-gate.mjs --json

# Generate cryptographic evidence artifact bound to current HEAD
node scripts/release-gate.mjs --environment testnet --generate-evidence --out docs/acceptance/release-gates-evidence.json

# Verify evidence artifact in CI pipeline
node scripts/release-gate.mjs --verify-evidence docs/acceptance/release-gates-evidence.json

# Run individual rehearsal scripts
node scripts/rehearse-rollback.mjs --json
node scripts/rehearse-emergency-pause.mjs --json
```
