# CCTP transfer tracker — API

## `POST /api/insights/cctp-transfers`

Read-only. Rate-limited to 20 requests/minute per client. No
authentication required; writes nothing server-side.

### Request body

```jsonc
{
  "sourceChain": "Ethereum",          // required — a name domainMap.ts recognizes
  "transactionHash": "0x...",         // required — the source burn transaction
  "network": "testnet",               // optional, "mainnet" or "testnet", defaults to "mainnet"
  "evaluatedAt": "2026-03-01T12:00:00.000Z" // optional, defaults to now
}
```

### Response (`200`)

```jsonc
{
  "report": {
    "schemaVersion": "cctp-transfers/2026-01",
    "evaluatedAt": "2026-03-01T12:00:00.000Z",
    "network": "testnet",
    "sourceChain": "Ethereum",
    "sourceDomain": 0,
    "transactionHash": "0xcfc0abf8b9251719212a90edadf9ca1866b0e9e7ab4952eaf648701562fabecd",
    "burn": {
      "state": "completed",
      "blockNumber": 11960213,
      "nonce": "0xc5d43240e77e25a22dd8e0b06998101f7880795739a2c5bdb31a4d3a0907a5b6",
      "burnTokenAddress": "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
      "depositorAddress": "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
      "mintRecipientRaw": "0x000000000000000000000000...",
      "mintRecipientDisplay": "...",
      "destinationDomain": 27,
      "destinationChain": "Stellar",
      "maxFeeBaseUnits": "50",
      "minFinalityThreshold": 1000,
      "amountBaseUnits": "500000",
      "rawMessageHex": "0x...",
      "issues": []
    },
    "attestation": {
      "state": "completed",
      "status": "complete",
      "feeExecutedBaseUnits": "50",
      "cctpVersion": 2,
      "destinationMintTxHashReported": "...",
      "attestedMessageHex": "0x...",
      "issues": []
    },
    "destination": { "state": "completed", "destinationChain": "Stellar", "nonceUsed": true, "issues": [] },
    "amountReconciliation": { "state": "reconciled", "grossAmountBaseUnits": "500000", "feeExecutedBaseUnits": "50", "netAmountBaseUnits": "499950", "note": "..." },
    "coverage": { "state": "complete", "note": "..." },
    "transferVerdict": null,
    "readOnly": true
  }
}
```

### Error responses

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | The request body failed schema validation |
| 400 | `unknown_source_chain` | `sourceChain` does not match a name in `domainMap.ts` |
| 400 | `invalid_json` | The request body was not valid JSON |
| 413 | `payload_too_large` | The request body exceeded 8,192 bytes |
| 429 | — | Rate limit exceeded (20 requests/minute) |
| 500 | `cctp_transfer_tracking_failed` | An unexpected error occurred |

A source chain that is real but has no RPC configured in this app (for
example, a request naming a CCTP chain outside the table in
`cctp-transfers-evidence.md`) is **not** a 400: `sourceChain` only
validates against the request schema's string type, and the real check
happens inside the burn step. That request returns `200` with
`burn.state: "unknown"` and an explanatory `issues` entry. Likewise, a
destination this tool has no RPC path for returns `200` with
`destination.state: "unknown"`, never a client error — the transaction
and chain are real, this tool just cannot check that half of it.

All responses carry `cache-control: no-store`.
