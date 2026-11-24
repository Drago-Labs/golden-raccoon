# Transaction preconditions API

`POST /api/insights/tx-preconditions`

Request JSON:

- `envelopeXdr`: base64 transaction envelope XDR (fee-bump wrappers allowed).
- `network`: `stellar-testnet` or `stellar-pubnet`. The Horizon host is chosen from this value.
- `passphrase`: optional. When present it must be the passphrase of `network`. This endpoint does not sign.
- `evaluatedAt`: optional ISO-8601 timestamp used by tests to pin the comparison clock when ledger state is available.

Responses:

- `200` with `{ report }` when the envelope decoded. `report.state` is `complete` or `partial`.
- `503` with `{ report }` when the ledger provider is unavailable. `report.state` is `unavailable`. `Retry-After: 15`.
- `400` for invalid JSON, invalid request, or invalid XDR (`invalid_json`, `invalid_request`, `invalid_xdr`).
- `413` when the declared body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.signsOrSubmits` is always false. `report.readOnly` is always true. `report.validityWindow.currentlyValid` is true only when every present precondition is satisfied against the recorded ledger state.
