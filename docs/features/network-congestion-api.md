# Network congestion API

`POST /api/insights/network-congestion`

Read-only. The response is `cache-control: no-store`. There is no GET, and the body cannot name a Horizon URL.

Rate limit: 20 requests per minute for the `network-congestion` namespace. A limited call returns HTTP 429 with `{ "error": "rate_limited" }` and does not read ledgers.

Bodies larger than 8192 bytes return HTTP 413 `{ "error": "payload_too_large", "limitBytes": 8192 }`. A body that is not JSON returns HTTP 400 `{ "error": "invalid_json" }`.

## Request

Exactly one window:

```json
{ "network": "stellar-pubnet", "fromSequence": 100, "toSequence": 102 }
```

```json
{ "network": "stellar-pubnet", "fromTime": "2026-04-01T00:00:00.000Z", "toTime": "2026-04-01T00:00:10.000Z" }
```

```json
{ "network": "stellar-pubnet", "atTime": "2026-04-01T00:00:07.000Z", "radius": 0 }
```

```json
{ "network": "public", "atLedger": 100 }
```

| Field | Rule |
| --- | --- |
| `network` | `stellar-pubnet`, `pubnet`, `public`, `mainnet`, or the testnet aliases `stellar-testnet`, `testnet`, `stellar`. |
| `fromSequence`, `toSequence` | Positive integers. Both required together. `to` may equal `from`. |
| `fromTime`, `toTime` | ISO-8601 timestamps with an offset. Both required together. |
| `atTime` | One timestamp. The match is the latest ledger that had already closed. |
| `atLedger` | One sequence. |
| `radius` | Integer 0 through 20. Allowed only with `atTime` or `atLedger`. Default 4. |

Naming two kinds of window, or only one end of a range, is HTTP 400 `invalid_request`. An end before the start is HTTP 400 `window_inverted`. More than 240 ledgers is HTTP 400 `window_too_large`. An unknown network name is HTTP 400 `unknown_network`.

`timestamp_not_closed` and `timestamp_unresolved` and `ledger_not_found` are HTTP 404. `provider_unavailable` and `passphrase_mismatch` are HTTP 503. `provider_timeout` is HTTP 504. Any other failure is HTTP 500 `{ "error": "network_congestion_failed" }` with no stack trace.

Error bodies use `{ "error", "message", "details" }`.

## Response

HTTP 200 `{ "report": CongestionReport }`.

`schemaVersion` is `network-congestion/2026-10`. `readOnly` is always `true`.

```json
{
  "report": {
    "schemaVersion": "network-congestion/2026-10",
    "network": {
      "id": "stellar-pubnet",
      "passphrase": "Public Global Stellar Network ; September 2015",
      "caip2": "stellar:pubnet"
    },
    "window": {
      "fromSequence": 100,
      "toSequence": 102,
      "fromTime": null,
      "toTime": null,
      "focusSequence": null
    },
    "capacity": {
      "ledgers": [
        {
          "sequence": 100,
          "closedAt": "2026-04-01T00:00:00.000Z",
          "operationCount": 2,
          "maxOperations": 100,
          "usageBasisPoints": 200,
          "full": false
        }
      ],
      "gaps": [],
      "meanUsageBasisPoints": 233,
      "fullLedgerCount": 0,
      "presentLedgerCount": 3
    },
    "surges": [],
    "fees": {
      "classicInclusion": {
        "unit": "stroops_per_operation",
        "sampleCount": 2,
        "p50": "100",
        "p90": "100",
        "p99": "100",
        "min": "100",
        "max": "100"
      },
      "sorobanInclusion": {
        "unit": "stroops_per_operation",
        "sampleCount": 1,
        "p50": "100",
        "p90": "100",
        "p99": "100",
        "min": "100",
        "max": "100"
      },
      "sorobanResource": {
        "unit": "stroops",
        "sampleCount": 1,
        "p50": "5000",
        "p90": "5000",
        "p99": "5000",
        "min": "5000",
        "max": "5000",
        "rentStroopsIncluded": "100"
      }
    },
    "lookup": null,
    "coverage": {
      "state": "complete",
      "note": "All 3 ledger(s) in the window were read, and every included transaction was classified.",
      "presentLedgerCount": 3,
      "gapCount": 0,
      "missingLedgerCount": 0,
      "truncated": false,
      "omittedTransactionCount": 0,
      "unsplitSorobanCount": 0
    },
    "readOnly": true
  }
}
```

The capacity example above shows one ledger of the quiet window. The mean `233` is the whole window: basis points `200`, `100`, and `400`, divided by 3 with integer division. The three fee objects are the whole window. `5000` is the Soroban resource fee. It is not `5100`, which would be that resource fee added to the 100 stroop inclusion fee. `rentStroopsIncluded` is already inside the resource fee.

`fees` has exactly three keys: `classicInclusion`, `sorobanInclusion`, `sorobanResource`. Percentile fields are decimal strings or `null` when `sampleCount` is 0. Inclusion units are `stroops_per_operation`. The resource unit is `stroops`.

`surges[]` contains `fromSequence`, `toSequence`, `ledgerCount`, `startedAt`, `endedAt`, `baseFeeStroops`, `classicInclusionFloorStroops`, `sorobanInclusionFloorStroops`, and `pricedAboveBase`. Floors are stroops per operation, or `null`. There is no resource-fee floor on a surge.

`capacity.gaps[]` contains `fromSequence`, `toSequence`, and `missingCount`. Those sequences are not in `capacity.ledgers`.

`coverage.state` is `complete`, `partial`, or `empty`. A provider failure does not use this object; the route returns an error so the client cannot render invented zeros. `partial` means a gap, a truncated page, an omitted transaction, or an unsplit Soroban fee.

`lookup` is `null` for a plain range. For `atTime` or `atLedger` it is `{ matchedSequence, matchedClosedAt, note }`.

## Page

`GET /insights/network-congestion` renders the same report: a labelled window form, a capacity table (the bars repeat the table and are hidden from assistive tech), a stacked surge list, three fee tables, and a coverage notice. Tables sit in `overflow-x-auto` regions so a 390px-wide layout can scroll them. The surge list is a single column.
