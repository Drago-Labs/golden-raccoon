# Path-payment route inspector

`/insights/path-payment` normalizes strict-send and strict-receive Horizon path results into hop tables with canonical asset keys, venue labels, quote age, and explicit failure categories. Estimates are never presented as executable without a completed simulation. Same-symbol assets from different issuers remain distinct.

From `frontend/`:

```bash
npx vitest run tests/features/path-payment
npx tsc --noEmit --project tests/features/path-payment/tsconfig.json
npx eslint src/server/research/path-payment src/components/research/path-payment src/app/api/insights/path-payment src/app/insights/path-payment tests/features/path-payment e2e/specs/path-payment.spec.ts
PORT=3023 NEXT_PUBLIC_APP_URL=http://localhost:3023 npx playwright test e2e/specs/path-payment.spec.ts --project=chromium-desktop --project=chromium-mobile
```
