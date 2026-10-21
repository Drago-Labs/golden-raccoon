# Stellar holder distribution API

`POST /api/insights/stellar-holders`

Read-only. The response is `cache-control: no-store`. Nothing is written.

## Request

```json
{
  "asset": "CODE:ISSUER",
  "network": "stellar-testnet",
  "topN": 10,
  "maxPages": 5,
  "pageSize": 200
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `asset` | yes | Canonical `CODE:ISSUER`. Code is 1–12 letters or digits, case preserved. Issuer is an ed25519 account id. |
| `network` | yes | `stellar-testnet`, `stellar-pubnet`, or an alias of those (`testnet`, `pubnet`, `stellar-mainnet`). |
| `topN` | no | Integer 1–50. Default 10. Shares for 1, 5, and 10 are always included. |
| `maxPages` | no | Integer 1–5. Default 5. |
| `pageSize` | no | Integer 1–200. Default 200. |

Bodies larger than 16,384 bytes return `413`.

## Success response

`200` with `{ "report": HolderDistributionReport }`.

```json
{
  "schemaVersion": "stellar-holders/2026-01",
  "state": "complete",
  "readOnly": true,
  "network": "stellar-testnet",
  "asset": {
    "code": "CONC",
    "issuer": "G...",
    "network": "stellar-testnet",
    "canonical": "CONC:G...",
    "resultKey": "stellar-testnet|CONC|G..."
  },
  "ledger": 482113,
  "ledgerClosedAt": "2026-04-01T00:00:00Z",
  "holders": [
    {
      "accountId": "G...",
      "balance": "50.0000000",
      "baseUnits": "500000000",
      "role": "distribution",
      "shareOfAccounts": { "numerator": "1", "denominator": "2" },
      "shareOfPublicFloat": null
    }
  ],
  "supply": {
    "issued": "100.0000000",
    "issuedBaseUnits": "1000000000",
    "contracts": "0.0000000",
    "contractsBaseUnits": "0",
    "buckets": [
      {
        "id": "trustlines",
        "label": "Account trustlines",
        "amount": "100.0000000",
        "baseUnits": "1000000000",
        "shareOfIssued": { "numerator": "1", "denominator": "1" }
      }
    ],
    "pools": [],
    "claimables": [],
    "snapshot": {
      "authorized": "100.0000000",
      "authorizedToMaintainLiabilities": "0.0000000",
      "unauthorized": "0.0000000",
      "liquidityPools": "0.0000000",
      "claimableBalances": "0.0000000",
      "contracts": "0.0000000"
    }
  },
  "concentration": {
    "accounts": {
      "defined": true,
      "holderCount": 4,
      "total": "100.0000000",
      "totalBaseUnits": "1000000000",
      "topShares": [{ "n": 1, "share": { "numerator": "1", "denominator": "2" }, "amount": "50.0000000", "baseUnits": "500000000" }],
      "gini": { "numerator": "3", "denominator": "8" },
      "herfindahl": { "numerator": "73", "denominator": "200" }
    },
    "publicFloat": {
      "defined": true,
      "holderCount": 3,
      "gini": { "numerator": "1", "denominator": "3" },
      "herfindahl": { "numerator": "23", "denominator": "50" }
    }
  },
  "issuerAdjacency": {
    "issuer": "G...",
    "distributionAccounts": ["G..."],
    "tomlRead": true
  },
  "coverage": {
    "state": "complete",
    "covered": "100.0000000",
    "issued": "100.0000000",
    "fraction": { "numerator": "1", "denominator": "1" },
    "holdersSeen": 4,
    "pagesRead": 1,
    "truncated": false,
    "duplicateCursor": false,
    "note": "Trustlines, liquidity-pool reserves, and claimable balances observed at ledger 482113 sum to the issued supply."
  },
  "error": null
}
```

`state` and `coverage.state` are `complete`, `partial`, `empty`, or `unavailable`.

`role` is `issuer`, `distribution`, or `public`. `shareOfPublicFloat` is null for issuer and distribution rows.

A provider failure is still `200`. `state` is `unavailable`, `concentration` and `supply` are null, `coverage.fraction` is `{ "numerator": "0", "denominator": "0" }`, and `error.code` is `provider_unavailable`.

## Errors

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `invalid_json` | Body is not JSON. |
| 400 | `invalid_request` | Schema rejected the body. |
| 400 | `invalid_asset` | Not a canonical issued asset. |
| 400 | `unsupported_network` | Network is not Stellar testnet or pubnet. |
| 413 | `payload_too_large` | Body exceeds 16,384 bytes. |
| 429 | `rate_limited` | More than 20 requests per minute from one client. |
| 503 | `provider_unavailable` | Unexpected failure outside the report. |

Ratios are already reduced. Compare `numerator` and `denominator`; do not round the coefficient before comparing it to a fixture.
