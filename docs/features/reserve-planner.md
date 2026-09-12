# Stellar reserve and sponsorship planner

The workspace at `/insights/reserve-planner` explains how an authenticated Stellar account's total XLM becomes minimum reserve, selling liabilities, a user-selected fee allowance, and spendable balance. It is linked from the XLM balance card.

Account counters and the native balance come from the configured Horizon data adapter. The account's `last_modified_ledger` selects the ledger record used for `base_reserve_in_stroops`; the observation ledger and redacted provider source remain visible. A missing parameter, wallet mismatch, ledger mismatch, or impossible sponsorship counter blocks a definitive calculation. Unsupported entry types and obligation shortfalls produce a partial result.

All arithmetic converts decimal XLM to integer stroops before calculation. Minimum reserve uses `(2 + subentry_count + num_sponsoring - num_sponsored) × observed_base_reserve`. Selling liabilities and fee allowance are deducted separately. Self-funded, sponsoring, and sponsored counters remain visible before and after every scenario.

Scenarios alter a copied counter set and are bounded to 20 entries. The endpoint and UI never create XDR, prepare an operation, request a signature, or submit a transaction. Wallet and network changes hide old results, and late responses are ignored.

From `frontend/` run:

```bash
npx vitest run tests/features/reserve-planner
npx tsc --noEmit --project tests/features/reserve-planner/tsconfig.json
npx eslint src/server/research/reserve-planner src/components/research/reserve-planner src/app/api/insights/reserve-planner src/app/insights/reserve-planner tests/features/reserve-planner e2e/specs/reserve-planner.spec.ts
PORT=3018 NEXT_PUBLIC_APP_URL=http://localhost:3018 npx playwright test e2e/specs/reserve-planner.spec.ts --project=chromium-desktop --project=chromium-mobile
```

Fixtures and browser interception avoid live funds, signing, paid services, and external network access.
