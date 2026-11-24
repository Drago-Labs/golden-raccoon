# Counterparty flows API

`POST /api/insights/counterparty-flows`

## Request JSON

- `account`: a Stellar account id (`G…`).
- `network`: `stellar-testnet` or `stellar-pubnet`.
- `window`: optional preset `7d` | `30d` | `90d` (default `30d`).
- `windowStart` / `windowEnd`: optional ISO-8601 pair. When both are set they replace the preset. The span cannot exceed 90 days.

## Responses

- `200` with `{ report }` when history was read. `report.state` is `complete` or `partial`.
- `503` with `{ report }` when every provider is unavailable. `Retry-After: 15`.
- `404` when the account does not exist on the selected network.
- `400` for invalid JSON or an invalid request.
- `413` when the declared body exceeds the request limit.

Every response sets `cache-control: no-store`.

## Report shape

- `totals[]`: `{ counterparty, label, labelEvidence, asset, direction, amount, eventCount }`
- `concentration[]`: `{ direction, asset, defined, counterpartyCount, totalAmount, topShares[], herfindahl }`
- `readOnly` is always `true`.
- `label` is `null` when the identity directory has no entry for that counterparty.
