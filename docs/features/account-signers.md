# Account signer thresholds workbench

`/insights/account-signers` reads an account's signer weights, master-key weight, low/medium/high thresholds, and sponsorship. It maps classic operations to required thresholds and shows whether the observed signer set can meet them. Reachability is never presented as private-key possession. Soroban authorization stays an unsupported, contract-specific case.

From `frontend/`:

```bash
npx vitest run tests/features/account-signers
npx tsc --noEmit --project tests/features/account-signers/tsconfig.json
npx eslint src/server/research/account-signers src/components/research/account-signers src/app/api/insights/account-signers src/app/insights/account-signers tests/features/account-signers e2e/specs/account-signers.spec.ts
PORT=3022 NEXT_PUBLIC_APP_URL=http://localhost:3022 npx playwright test e2e/specs/account-signers.spec.ts --project=chromium-desktop --project=chromium-mobile
```

Fixtures intercept provider I/O; no signing or live funds are required.
