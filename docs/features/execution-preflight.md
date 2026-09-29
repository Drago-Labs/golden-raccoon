# Execution preflight budget

Read-only worst-case budget for a prepared plan and simulation snapshot.

## Rules

- Exact integer base units for spend, fees, min receive, and reserve.
- EVM gas and Stellar base/resource fees are distinct rows.
- Stale simulation, network mismatch, or plan-hash mismatch refuses
  `safeToPresentAsComplete`.
- Never signs or sends a transaction.

## Entry points

- Page: `/insights/execution-preflight`
- API: `POST /api/insights/execution-preflight`

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/execution-preflight
```
