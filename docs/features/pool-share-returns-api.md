# Pool Share Returns API

## Endpoint

```
POST /api/insights/pool-share-returns
```

## Request Schema

```typescript
{
  account: string;        // Stellar account address (G...)
  poolId: string;         // Liquidity pool ID
  network: "stellar-testnet" | "stellar-pubnet";
  windowStart: number;    // Start ledger (inclusive)
  windowEnd: number;      // End ledger (inclusive)
}
```

### Example Request

```json
{
  "account": "GABC123...",
  "poolId": "pool-1",
  "network": "stellar-testnet",
  "windowStart": 100,
  "windowEnd": 200
}
```

## Response Schema

```typescript
{
  report: {
    schemaVersion: number;
    account: string;
    poolId: string;
    network: string;
    windowStart: number;
    windowEnd: number;
    state: "complete" | "partial" | "unavailable";
    breakdown: {
      holdValue: string;
      poolValue: string;
      feeIncome: string;
      divergenceLoss: string;
      totalReturn: string;
    } | null;
    position: Array<{
      ledger: number;
      shares: string;
      operation: "deposit" | "withdrawal" | "initial";
    }>;
    reserves: Array<{
      ledger: number;
      reserveA: string;
      reserveB: string;
      totalShares: string;
    }>;
    prices: Array<{
      ledger: number;
      assetA: string;
      assetB: string;
      priceA: string;
      priceB: string;
    }>;
    coverageGaps: Array<{
      fromLedger: number;
      toLedger: number;
      reason: "missing_reserves" | "missing_prices";
    }>;
    coverageNotice: string;
    priceSource: string;
    readOnly: boolean;
  }
}
```

## Status Codes

- **200**: Success - report calculated
- **400**: Bad request - invalid parameters
- **404**: Not found - account or pool does not exist
- **413**: Payload too large
- **429**: Rate limit exceeded
- **503**: Service unavailable - provider temporarily unavailable (Retry-After header set)

## Rate Limiting

- 20 requests per minute per namespace
- Rate limit header: `X-RateLimit-Remaining`

## Error Response

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

### Error Codes

- `invalid_request`: Request validation failed
- `invalid_json`: Request body is not valid JSON
- `payload_too_large`: Request exceeds size limit
- `not_found`: Account or pool not found
- `response_too_large`: Response would exceed size limit
- `timeout`: Calculation exceeded time limit
- `pool_returns_calculation_failed`: Internal error
