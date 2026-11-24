# Issuance ledger API

`POST /api/insights/issuance-ledger`

Request JSON:

- `assetCode`: classic asset code (1–12 characters).
- `issuer`: Stellar issuer account id.
- `network`: `stellar-testnet` or `stellar-pubnet`. A pubnet request uses `https://horizon.stellar.org` and is never sent to the testnet host.
- `passphrase`: optional. When present it must match `network`. This endpoint does not sign.
- `fromLedger` and `toLedger`: inclusive integers. `toLedger` must be greater than or equal to `fromLedger`, and the span cannot exceed 500,000 ledgers.

Responses:

- `200` with `{ report }` when history was read. `report.state` is `complete` or `partial`. `report.reconciled` is true only when every checkpoint with a network figure matches and the history is complete.
- `503` with `{ report }` when the provider is unavailable. `report.reconciled` is false and `report.operations` is empty. `Retry-After: 15`.
- `404` when the issuer or asset does not exist on the selected network.
- `400` for invalid JSON or an invalid request.
- `413` when the declared body or a provider body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.operations[].amountStroops` is the signed supply delta. `report.checkpoints[].deltaStroops` is network minus reconstructed, in stroops, or null when the network figure was unavailable. `report.unreconciled[].surrounding` lists nearby ledger operations for each gap. `report.readOnly` is always true.
