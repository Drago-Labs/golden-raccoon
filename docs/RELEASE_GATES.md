# Machine-Checkable Release Readiness Gates & Evidence Specification

> **Status**: Pipeline-Enforced & Machine-Checkable  
> **Reference Issue**: #195  
> **Enforcement Entrypoint**: `node scripts/release-gate.mjs`  
> **API Surface**: `GET /api/operations/readiness`

---

## 1. Overview & Problem Statement

Historically, release readiness depended on subjective human verification across disparate runbooks, markdown checklists, and unstandardised console scripts. This introduced two critical failure modes:
1. **Unverifiable Claims**: Static evidence documents could become stale or manually edited, citing evidence that never ran against the candidate commit.
2. **Untested Emergency Procedures**: Rollback and emergency pause runbooks existed only as prose, meaning their first true execution would occur in the middle of a live production incident.

This release hardening replaces manual review with **machine-checkable readiness gates bound to the git commit SHA**, validated via cryptographic digests and verifiable evidence artifacts.

---

## 2. Machine-Checkable Gates Architecture

Every gate is defined with an explicit severity (`critical` vs `warning`), an automated execution check, and structured diagnostic outputs.

| Gate ID | Name | Severity | What It Enforces | Automated Rehearsal |
|---|---|---|---|---|
| `gate_rollback_rehearsal` | Rollback Rehearsal | **CRITICAL** | Automated failover to recommendation-only mode via execution kill switches (`DISABLE_EXECUTION_PROVIDERS`). | `scripts/rehearse-rollback.mjs` |
| `gate_emergency_pause_rehearsal` | Emergency Pause Rehearsal | **CRITICAL** | EVM `emergencyPause()` and Soroban `emergency_pause` contract hooks and transaction submission blocks. | `scripts/rehearse-emergency-pause.mjs` |
| `gate_smoke_coverage` | Critical Route Smoke Coverage | **CRITICAL** | Validates smoke assertions across `/api/health`, `/api/agents/portfolio`, `/api/execute/prepare`, and `/api/x402/terms`. | `scripts/smoke-api.mjs --json` |
| `gate_load_behavior` | Load Behavior & Budgets | **WARNING** | Validates execution and simulation load test drivers against recorded throughput and p95 latency budgets. | `scripts/load-test-execution.mjs --json` |
| `gate_deployment_record` | Target Environment Deployment Record | **CRITICAL** *(in prod)* | Asserts that target deployment environment has completed records conforming to `docs/deployments/TEMPLATE.md`. | Verified in `scripts/release-gate.mjs` |
| `gate_slo_budgets` | SLO & Error Budgets | **WARNING** | Enforces error budget burn rates and latency SLO thresholds specified in `docs/SLO_ERROR_BUDGETS.md`. | Validated against baseline budgets |

---

## 3. Evidence Artifact & Tamper Resistance

Every run of `scripts/release-gate.mjs` can generate a machine-readable evidence artifact:

```json
{
  "schemaVersion": "1.0.0",
  "commitSha": "ef1c249a381c698ef67812820468d2fb4dbceffa",
  "environment": "production",
  "generatedAt": "2026-09-09T03:10:07.123Z",
  "verdict": {
    "verdict": "ready",
    "summary": { "total": 6, "passed": 6, "criticalFailures": 0, "warnings": 0 },
    "gates": [ ... ]
  },
  "digest": "b040f3f4e6d7ba0c91be5e11a5b82718015df478c4fac8a52df199feb15cbbda"
}
```

### Tamper Protection Principles:
1. **Commit Binding**: The evidence file is tied to the exact commit SHA being evaluated. Replaying an old artifact against a new commit fails with `STALE EVIDENCE`.
2. **Digest Verification**: A canonical SHA-256 digest is calculated over the gate outcomes. Any manual modification or tampering fails verification with `TAMPERED EVIDENCE`.
3. **Fail-Closed**: If any critical gate fails, the aggregate verdict is strictly `BLOCKED` (exit code 1) and details the failing gate and reason.

---

## 4. Operational Commands

### Run Release Readiness Gate
```bash
# Run all gates against current commit
node scripts/release-gate.mjs

# Run for specific environment (e.g. testnet or production)
node scripts/release-gate.mjs --env testnet

# Generate bound evidence artifact
node scripts/release-gate.mjs --generate-evidence --out docs/acceptance/evidence.json

# Verify evidence integrity in CI
node scripts/release-gate.mjs --verify-evidence docs/acceptance/evidence.json
```

### Rehearse Emergency Procedures
```bash
# Rehearse automated rollback
node scripts/rehearse-rollback.mjs

# Rehearse emergency multi-chain pause
node scripts/rehearse-emergency-pause.mjs
```

### Structured Smoke & Load Benchmarks
```bash
# Structured JSON smoke output
node scripts/smoke-api.mjs --json

# Structured JSON load test with budget comparison
node scripts/load-test-execution.mjs 5 50 http://localhost:3000 --json
```

---

## 5. Operations UI Surface

The operations dashboard at `/operations` automatically queries the aggregate verdict via `@/server/operations/gates/verdict` and renders the exact same breakdown enforced by the CI pipeline, ensuring 100% operational transparency between deployment automation and on-call operators.
