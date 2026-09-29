# Claimable balance eligibility explorer

`/insights/claimable-balances` discovers claimable balances for the authenticated Stellar wallet through configured Horizon endpoints. Discovery is bounded to 1–5 pages of at most 50 records, deduplicates IDs and cursors, and can recheck up to 20 known IDs. A missing known ID is reported as disappeared; the explorer never assumes who claimed it.

Predicate payloads are limited to eight levels and 64 nodes. Unconditional, absolute-before, relative-before, `and`, `or`, and `not` nodes are decoded. Evaluation uses the observed ledger close time. Exact absolute boundaries are exclusive. Relative predicates remain unknown when creation-time context is unavailable.

Predicate satisfaction and claim eligibility are separate. A true predicate is eligible only when the destination matches and a non-native asset has an authorized trustline. Missing account/trustline evidence stays unknown. The API requires wallet/network agreement and has no claim, XDR, signature, or submission operation.

From `frontend/`:

```bash
npx vitest run tests/features/claimable-balances
npx tsc --noEmit --project tests/features/claimable-balances/tsconfig.json
npx eslint src/server/research/claimable-balances src/components/research/claimable-balances src/app/api/insights/claimable-balances src/app/insights/claimable-balances tests/features/claimable-balances e2e/specs/claimable-balances.spec.ts
PORT=3019 NEXT_PUBLIC_APP_URL=http://localhost:3019 npx playwright test e2e/specs/claimable-balances.spec.ts --project=chromium-desktop --project=chromium-mobile
```

All fixtures intercept provider I/O and require no live account, funds, signing, or paid service.
