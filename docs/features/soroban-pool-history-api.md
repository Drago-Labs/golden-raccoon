# Soroban pool history API

## Endpoint

```
POST /api/insights/soroban-pool-history
```

## Request schema

```typescript
{
  poolId: string;                              // Soroban contract id (C...)
  network: "stellar-testnet" | "stellar-pubnet";
  fromLedger: number;                          // inclusive
  toLedger: number;                            // inclusive
}
```

### Example

```json
{
  "poolId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
  "network": "stellar-testnet",
  "fromLedger": 10,
  "toLedger": 50
}
```

## Response schema

```typescript
{
  report: {
    schemaVersion: "soroban-pool-history/2026-01";
    poolId: string;
    network: string;
    fromLedger: number;
    toLedger: number;
    state: "complete" | "partial" | "unavailable" | "unsupported";
    reserves: Array<{
      ledger: number;
      reserveA: string;
      reserveB: string;
      price: string;
      eventId: string | null;
    }>;
    prices: Array<{ ledger: number; price: string }>;
    largeTrades: Array<{
      eventId: string;
      ledger: number;
      kind: "swap" | "deposit" | "withdraw" | "sync";
      amountA: string;
      amountB: string;
      priceBefore: string;
      priceAfter: string;
      priceMoveBps: string;
      transactionHash: string;
    }>;
    drift: {
      matched: boolean;
      rebuiltReserveA: string;
      rebuiltReserveB: string;
      storageReserveA: string | null;
      storageReserveB: string | null;
      deltaA: string | null;
      deltaB: string | null;
    } | null;
    coverageGaps: Array<{
      fromLedger: number;
      toLedger: number;
      reason: "truncated_history" | "missing_storage" | "unknown_layout";
    }>;
    coverageNotice: string;
    driftNotice: string | null;
    unsupportedLayouts: string[];
    historyTruncated: boolean;
    readOnly: true;
  }
}
```

## Status codes

- **200**: Report produced (including `partial` and `unsupported`)
- **400**: Invalid request
- **404**: Pool not found
- **413**: Payload too large
- **429**: Rate limited
- **503**: Provider unavailable (`Retry-After: 15`)

## Error codes

- `invalid_request`
- `invalid_json`
- `payload_too_large`
- `not_found`
- `response_too_large`
- `timeout`
- `pool_history_failed`
