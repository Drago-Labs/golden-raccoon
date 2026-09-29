# Provider schema drift

Operator-only, replayable probe suite that compares bounded provider payloads
against versioned contracts.

## Rules

- Reachability is not enough: unit shifts and renamed fields are **breaking**.
- Failed probes are **unavailable**, not passes.
- Artifacts drop credentials, wallet identifiers, and `raw` private payloads.
- Runtime adapters are not auto-adapted; scores are unchanged.

## Triage

1. Replay fixtures with `mode: "replay"`.
2. Inspect breaking vs additive vs unavailable findings.
3. Optionally attach opt-in live payloads the operator already collected.
4. Fix or quarantine the adapter before scores consume the response.

## Entry points

- Page: `/insights/provider-schema-drift`
- API: `POST /api/ops/provider-schema-drift` (requires `x-operator-token`)

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/provider-schema-drift
```
