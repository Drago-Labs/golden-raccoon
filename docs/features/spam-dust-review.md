# Spam and dust review

A wallet-scoped, read-only workspace that classifies spam-like and dust holdings
with explainable signals and reversible local visibility preferences.

## Rules

- Dust requires a **usable price** and a tiny USD value. High-value unpriced
  holdings get an `unpriced` signal only — never `tiny_value`.
- Asset keys are chain-aware (`chain|symbol|address|issuer|contract`). Same
  symbols on different networks do not share preferences.
- Hide/show is local. Hidden assets stay listed and contribute to balance
  uncertainty. The portfolio record is never mutated.
- Token-provided URLs are inspected as strings and never fetched.

## Entry points

- Page: `/insights/spam-dust-review`
- API: `POST /api/insights/spam-dust-review`

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/spam-dust-review
npm run quality:gate
```

## Out of scope

Sending tokens, revoking trustlines, changing portfolio risk scoring, or
asserting an asset is malicious.
