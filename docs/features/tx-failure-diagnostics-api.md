# Failed transaction diagnostics API

`POST /api/insights/tx-failure-diagnostics`

Request JSON:

- `hash`: 64 hex characters.
- `network`: `stellar-testnet` or `stellar-pubnet`. The Horizon host is chosen from this value. A pubnet request is never sent to the testnet host.
- `passphrase`: optional. When present it must be the passphrase of `network`. This endpoint does not sign.

Responses:

- `200` with `{ report }` when result XDR was decoded. `report.state` is `complete` or `partial`.
- `503` with `{ report }` when the transaction provider is unavailable. `report.state` is `unavailable` and `report.transactionCode` is null. `Retry-After: 15`.
- `404` when no transaction exists for that hash on the selected network.
- `400` for invalid JSON or an invalid request (`invalid_json`, `invalid_request`, `invalid_xdr`).
- `413` when the declared body or a provider body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.signsOrRetries` is always false. `report.feeBump` is null for a transaction that is not a fee bump. `report.operations[].outcome` is `would_succeed_alone`, `aborted_transaction`, or `not_attempted`.
