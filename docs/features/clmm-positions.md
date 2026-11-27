# Concentrated liquidity positions

## Overview

Read-only explainer for Uniswap v3-style concentrated-liquidity (CLMM) position NFTs. For an address it decodes each position's pool, tick range, current token composition, in-range status, and uncollected fees.

## Method

### Input

- **Address**: EVM account that owns NonfungiblePositionManager NFTs
- **Network**: `ethereum`, `base`, or `arbitrum`
- Optional **pageSize** / **cursor** for pagination

### Steps

1. Resolve the Uniswap v3 NonfungiblePositionManager deployment for the network.
2. Read position NFTs for the address (token id, pool keys, ticks, liquidity, fee growth checkpoints, tokens owed).
3. Read pool `slot0` (sqrt price / tick), global fee growth, and tick fee-growth-outside values at the position bounds.
4. Compute token amounts with Uniswap `LiquidityAmounts` tick math.
5. Compute uncollected fees from fee-growth-inside deltas.
6. Classify range status and distance to each bound in price and percent terms.
7. Aggregate open-position totals; list closed / zero-liquidity positions but exclude them from those totals.

### Amount formulas

With `sqrtP` the current sqrt price and `sqrtA` / `sqrtB` the bound sqrt prices (`sqrtA < sqrtB`), liquidity `L`:

```
if sqrtP <= sqrtA:
  amount0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB) * 2^96
  amount1 = 0
else if sqrtP < sqrtB:
  amount0 = L * (sqrtB - sqrtP) / (sqrtP * sqrtB) * 2^96
  amount1 = L * (sqrtP - sqrtA) / 2^96
else:
  amount0 = 0
  amount1 = L * (sqrtB - sqrtA) / 2^96
```

### Fee formula

```
feeGrowthInside = feeGrowthGlobal - feeGrowthBelow - feeGrowthAbove
uncollected = (feeGrowthInside - feeGrowthInsideLast) * L / 2^128 + tokensOwed
```

### Range status

- **in_range**: `tickLower <= tickCurrent < tickUpper` and liquidity > 0
- **out_of_range_below** / **out_of_range_above**: price outside the range; report distance to the nearest bound
- **closed**: liquidity is zero

## Limitations

- Does not manage, collect, or rebalance positions
- Does not build transactions
- Provider configuration is required for live chain reads; fixture-driven tests inject recorded responses
