# Network settings API

`POST /api/insights/network-settings`

Read-only. The route does not write network config, cast a vote, or touch the risk score. Responses send `cache-control: no-store`. The handler is rate limited to 30 requests a minute per client.

## Request

```json
{
  "network": "testnet",
  "page": 1,
  "compare": { "beforeLedger": 1000, "afterLedger": 2000 }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| network | `"testnet"` \| `"futurenet"` \| `"mainnet"` | yes | Any other string, including `pubnet` and `stellar-testnet`, is rejected. |
| page | positive integer | no | Defaults to 1. Page size is 50 rows. |
| compare.beforeLedger | positive integer | no | Ledger of the earlier recorded snapshot. Both ledgers are required together. |
| compare.afterLedger | positive integer | no | Must differ from `beforeLedger`. |

The body must be JSON and at most 32768 characters.

## Response

`200` when the provider answered. `state` is `complete` or `partial`.

`503` when the provider timed out, failed, or returned another network's passphrase. The body still includes `report` so the client can show the coverage notice and any recorded history. Settings are empty. Nothing is inferred.

```json
{
  "report": {
    "state": "partial",
    "network": "testnet",
    "ledger": 5312825,
    "protocolVersion": 29,
    "settingCount": 48,
    "page": 1,
    "settings": [
      {
        "key": "contractMaxSizeBytes",
        "settingId": 0,
        "name": "Maximum contract size",
        "value": "131072",
        "unit": "bytes",
        "known": true
      }
    ],
    "history": [
      {
        "network": "testnet",
        "ledger": 1000,
        "protocolVersion": 21,
        "upgradeType": "ledgerUpgradeVersion",
        "upgradeValue": "21",
        "settings": []
      }
    ],
    "diff": [
      {
        "key": "contractExecutionLanes.ledgerMaxTxCount",
        "name": "Maximum Soroban transactions per ledger",
        "unit": "transactions",
        "before": "100",
        "after": "80",
        "direction": "decrease"
      }
    ],
    "coverage": {
      "state": "partial",
      "requested": 21,
      "returned": 14,
      "unknown": 0,
      "historyKept": 2,
      "historyTruncated": false,
      "message": "7 requested setting ids were not in the response."
    },
    "warnings": []
  }
}
```

| Field | Meaning |
| --- | --- |
| state | `complete` when every requested setting id came back as a known value and history was not truncated. `partial` when some ids were absent, an unknown id was kept, history was truncated, or a compare ledger was missing. `unavailable` when the provider did not answer. |
| ledger | Latest ledger reported with the entries. Null when unavailable. |
| protocolVersion | Protocol version of that ledger. Null when unavailable. |
| settings | One page of decoded fields. `known: false` means the id was not in this build's catalogue and `value` is hex. |
| settingCount | Rows before paging. |
| history | Recorded upgrades for this network only, oldest first, at most 24. Each item has `ledger` and `protocolVersion`. |
| diff | Changed settings between the two requested ledgers. Null when `compare` is omitted or either ledger is absent. Omitted settings did not change. `direction` is `increase`, `decrease`, or `changed`. |
| coverage | Counts and a sentence that states what was not observed. |
| warnings | Other networks that were ignored, truncation, and missing snapshots. |

## Errors

| Status | error | When |
| --- | --- | --- |
| 400 | invalid_json | Body is not JSON. |
| 400 | unknown_network | `network` is missing or not one of the three ids. |
| 400 | invalid_request | Schema failed, including two compare ledgers that are the same number. |
| 413 | payload_too_large | Body or a single setting XDR exceeds its bound. |
| 429 | rate_limited | The client exceeded 30 requests in 60 seconds. |
| 503 | — | Provider failure. `report.state` is `unavailable`. |
| 500 | network_settings_failed | Unexpected failure. |

An unavailable response does not substitute another network's last good read.
