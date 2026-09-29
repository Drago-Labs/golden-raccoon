# Soroban authorization footprint inspector

`/insights/soroban-auth-footprint` decodes nested Soroban authorization from a bounded unsigned envelope XDR and/or simulation JSON. It preserves contract ID, function, argument hash, passphrase, nonce, expiration ledger, and nesting. Unknown contracts, unsupported ScVal types, duplicates/conflicts, and expiring credentials are flagged explicitly. **Decoding is not approval** — unknown authorization never becomes a green state.

From `frontend/`:

```bash
npx vitest run tests/features/soroban-auth-footprint
npx tsc --noEmit --project tests/features/soroban-auth-footprint/tsconfig.json
npx eslint src/server/research/soroban-auth-footprint src/components/research/soroban-auth-footprint src/app/api/insights/soroban-auth-footprint src/app/insights/soroban-auth-footprint tests/features/soroban-auth-footprint e2e/specs/soroban-auth-footprint.spec.ts
PORT=3024 NEXT_PUBLIC_APP_URL=http://localhost:3024 npx playwright test e2e/specs/soroban-auth-footprint.spec.ts --project=chromium-desktop --project=chromium-mobile
```
