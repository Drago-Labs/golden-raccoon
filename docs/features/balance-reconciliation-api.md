# Balance reconciliation API

`POST /api/insights/balance-reconciliation`

Request JSON:

- `account`: a Stellar account id.
- `network`: `stellar-testnet` or `stellar-pubnet`. A pubnet request uses `https://horizon.stellar.org` and is never sent to the testnet host.
- `passphrase`: optional. When present it must match `network`. This endpoint does not sign.
- `fromLedger` and `toLedger`: inclusive integers. `toLedger` must be greater than or equal to `fromLedger`, and the span cannot exceed 500,000 ledgers.

Responses:

- `200` with `{ report }` when history was read. `report.state` is `complete` or `partial`. `report.matched` is true only when every asset delta is `0` and the history is complete.
- `503` with `{ report }` when the provider is unavailable. `report.matched` is false and `report.timeline` is empty. `Retry-After: 15`.
- `404` when the account does not exist on the selected network.
- `400` for invalid JSON or an invalid request.
- `413` when the declared body or a provider body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.pricesConverted` is always false. `report.reconciliation[].deltaStroops` is the recorded end balance minus the reconstructed balance, in stroops. It is null when the recorded end balance was not available. `report.timeline[].stroops` is signed. Fee-bump fees use the sponsor account.
