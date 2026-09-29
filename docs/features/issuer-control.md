# Issuer control and trustline exposure inspector

`/insights/issuer-control` explains a Stellar asset issuer's current control flags, the queried account's trustline authorization state, and bounded authorization or clawback events. Every observation keeps its network, Horizon source, and ledger or time. The feature never signs, creates trustlines, or changes the risk score.

Asset identity is network-aware: native XLM, classic `CODE:ISSUER`, and Soroban/SAC identities resolve separately so same-code assets from different issuers never share observations. Missing provider evidence becomes `unavailable` / `partial` — never an "authorized" or "safe" claim.

From `frontend/`:

```bash
npx vitest run tests/features/issuer-control
npx tsc --noEmit --project tests/features/issuer-control/tsconfig.json
npx eslint src/server/research/issuer-control src/components/research/issuer-control src/app/api/insights/issuer-control src/app/insights/issuer-control tests/features/issuer-control e2e/specs/issuer-control.spec.ts
PORT=3021 NEXT_PUBLIC_APP_URL=http://localhost:3021 npx playwright test e2e/specs/issuer-control.spec.ts --project=chromium-desktop --project=chromium-mobile
```

All fixtures intercept provider I/O and require no live account, funds, signing, or paid service.
