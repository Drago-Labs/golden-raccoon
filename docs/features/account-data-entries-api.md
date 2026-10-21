# Account data entries API

`POST /api/insights/account-data-entries`

Request JSON:

- `account`: a Stellar account id.
- `network`: `stellar-testnet` or `stellar-pubnet`. A pubnet request uses `https://horizon.stellar.org` and is never sent to the testnet host.
- `passphrase`: optional. When present it must match `network`. This endpoint does not sign.
- `recentWindowLedgers`: optional integer from 1 to 500000. Default 30.

Responses:

- `200` with `{ report }` when the account was read. `report.state` is `complete` or `partial`.
- `503` with `{ report }` when the account provider is unavailable. `report.entries` is empty. `Retry-After: 15`.
- `404` when the account does not exist on the selected network.
- `400` for invalid JSON or an invalid request.
- `413` when the declared body or a provider body exceeds its limit.

Every response sets `cache-control: no-store`.

`report.writesEntries` is always false. `report.entries[].utf8` is null for binary values. `report.entries[].history[].action` is `set`, `change`, or `delete`. A delete carries `lastValueBase64` from the previous set or change when that value was inside the fetched pages. `report.historyTruncated` and `report.oldestLedger` describe a partial history.
