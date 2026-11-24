# CLMM positions API

## Endpoint

```
POST /api/insights/clmm-positions
```

## Request

```typescript
{
  address: string;                       // EVM address (0x…)
  network: "ethereum" | "base" | "arbitrum";
  pageSize?: number;                     // 1–64
  cursor?: string;
}
```

### Example

```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "network": "ethereum"
}
```

## Response

```typescript
{
  report: {
    schemaVersion: number;
    address: string;
    network: string;
    deployment: string;
    state: "complete" | "partial" | "unavailable";
    positions: Array<{
      tokenId: string;
      pool: string;
      token0: string;
      token1: string;
      token0Symbol: string;
      token1Symbol: string;
      token0Decimals: number;
      token1Decimals: number;
      feeTierBps: number;
      tickLower: number;
      tickUpper: number;
      liquidity: string;
      closed: boolean;
      amounts: {
        amount0: string;
        amount1: string;
        amount0Raw: string;
        amount1Raw: string;
      };
      fees: {
        token0: string;
        token1: string;
        token0Raw: string;
        token1Raw: string;
      };
      range: {
        status: "in_range" | "out_of_range_below" | "out_of_range_above" | "closed";
        inRange: boolean;
        currentTick: number;
        tickLower: number;
        tickUpper: number;
        currentPrice: string;
        priceLower: string;
        priceUpper: string;
        distanceToLowerPercent: string | null;
        distanceToUpperPercent: string | null;
        distanceToNearestBoundPercent: string | null;
        nearestBound: "lower" | "upper" | null;
      };
    }>;
    totals: {
      openPositions: number;
      closedPositions: number;
      inRangePositions: number;
      outOfRangePositions: number;
      amount0: string;
      amount1: string;
      fees0: string;
      fees1: string;
    };
    coverageNotice: string;
    coverage: string[];
    nextCursor: string | null;
    readOnly: true;
  }
}
```

## Status codes

- **200**: Report calculated (`complete` or `partial`)
- **400**: Invalid request / JSON
- **413**: Payload too large
- **429**: Rate limited
- **503**: Provider unavailable (`Retry-After: 15`)

## Error body

```json
{ "error": "invalid_request", "message": "Human readable message" }
```
