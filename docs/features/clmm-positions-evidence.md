# CLMM positions evidence

## Sources

### Position NFTs

- **Contract**: Uniswap v3 `NonfungiblePositionManager`
- **Deployments**: see `frontend/src/server/research/clmm-positions/deployments.ts` (Ethereum, Base, Arbitrum)
- **Fields**: tokenId, token0/token1, fee, tickLower/tickUpper, liquidity, feeGrowthInside*LastX128, tokensOwed*

### Pool state

- **Contract**: Uniswap v3 Pool
- **Reads**: `slot0` (sqrtPriceX96, tick), `feeGrowthGlobal0X128` / `feeGrowthGlobal1X128`, tick `feeGrowthOutside*` at bounds
- **Math**: exact bigint tick math matching Uniswap v3 Solidity

### Recorded fixtures

Under `frontend/tests/features/clmm-positions/data/`:

| File | Scenario |
| --- | --- |
| `in-range.json` | Active position with current tick inside the range |
| `out-of-range.json` | Active position above the upper tick |
| `closed-position.json` | Zero-liquidity position still listed |
| `provider-unavailable.json` | Position provider failure |

## Limits

- Max request body: 8192 bytes
- Max positions per page: 64 (default page size 32)
- Timeout budget: 30 seconds
- Rate limit: 20 requests / minute on the insights route

## Coverage gaps

Missing pool reads mark the report `partial` (or `unavailable` if none succeed). Gaps are listed in `coverageNotice` and never interpolated.
