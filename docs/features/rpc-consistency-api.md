# Horizon and RPC consistency API

`POST /api/insights/rpc-consistency`

Read-only. Responses send `cache-control: no-store`. The route is rate limited
at 20 requests per minute per client. A body larger than 32_768 bytes is
rejected with HTTP 413.

## Request

```json
{
  "network": "testnet",
  "target": "G… or C…",
  "trustlines": [{ "code": "USDC", "issuer": "G…" }],
  "contractDataKeys": ["counter"]
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `network` | yes | `testnet` or `mainnet` |
| `target` | yes | Ed25519 account strkey or contract strkey, at most 56 characters |
| `trustlines` | no | At most 50 `{ code, issuer }` hints. `code` is 1–12 characters. `issuer` is 56 characters. |
| `contractDataKeys` | no | At most 20 symbol or string names, each at most 64 characters. Used when `target` is a contract. |

`trustlines` and `contractDataKeys` default to empty arrays.

## Success response

HTTP 200.

```json
{
  "report": {
    "schemaVersion": "rpc-consistency/2026-10",
    "network": "testnet",
    "target": { "kind": "account", "id": "G…" },
    "providers": [
      {
        "provider": "horizon",
        "availability": "available",
        "label": "Horizon",
        "latestLedger": 5100,
        "retentionStartLedger": 1000,
        "retentionEndLedger": 5100,
        "network": "testnet",
        "endpoint": "https://horizon-testnet.stellar.org",
        "detail": "Latest ledger is 5100. Retention window is ledgers 1000–5100."
      }
    ],
    "fields": [
      {
        "fieldId": "native_balance",
        "kind": "native_balance",
        "label": "Native balance",
        "classification": "matched",
        "horizon": { "ledger": 5000, "value": "100000000", "raw": {} },
        "rpc": { "ledger": 5000, "value": "100000000", "raw": {} },
        "conflict": null,
        "note": "Both providers report the same value at ledger 5000."
      }
    ],
    "lag": {
      "laggingFieldCount": 0,
      "largestFieldGap": null,
      "trailingProvider": null,
      "providerLedgerGap": 0,
      "note": "Compared fields were read at the same ledger, and the providers report the same latest ledger."
    },
    "coverage": {
      "state": "complete",
      "note": "All 3 compared field(s) matched at the same ledger.",
      "fieldCount": 3,
      "matchedCount": 3,
      "laggingCount": 0,
      "conflictingCount": 0,
      "singleSourceCount": 0,
      "horizonContractDataExposed": false,
      "omittedTrustlines": 0,
      "omittedLedgerKeys": 0
    },
    "readOnly": true
  }
}
```

`fields[].classification` is `matched`, `lagging`, `conflicting`, or
`single_source`.

`fields[].conflict` is null except for `conflicting`, where it is:

```json
{ "horizonRaw": {}, "rpcRaw": {} }
```

Both raw values are the provider payloads, not the canonical stroops text.

`coverage.state` is `complete`, `partial`, `single_source`, or `unavailable`.
`single_source` means one provider did not answer. `unavailable` means both
did not. Those are still HTTP 200: the check ran, and the report says what
was missing.

`providers[].availability` is `available` or `unavailable`. An unavailable
provider has `latestLedger`, `retentionStartLedger`, and `retentionEndLedger`
set to null and a `label` ending in `unavailable`.

`target.kind` is `account` or `contract`. `network` on the report is the
requested network. It is never the other one.

## Errors

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `invalid_json` | Body is not JSON |
| 400 | `invalid_request` | Body failed schema validation |
| 400 | `invalid_target` | Target is not an account or contract strkey |
| 400 | `invalid_network` | Network is not `testnet` or `mainnet` (also reported as `invalid_request` when the schema rejects it) |
| 400 | `network_mismatch` | A provider passphrase or host belongs to the other network |
| 413 | `payload_too_large` | Body exceeds 32_768 bytes |
| 429 | `rate_limited` | More than 20 requests in the current minute |
| 500 | `rpc_consistency_failed` | Unexpected failure |

Error bodies are `{ "error", "message", "details" }` for the typed cases.
`details` is null when there is nothing further to show. The route does not
include a stack trace.
