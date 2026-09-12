# Liquidity Depth and Trade-Size Capacity Analysis

## 1. Overview
The Liquidity Depth engine evaluates market depth, slippage, and maximum execution capacity across venues and networks. It supports order-book architectures (Stellar Horizon SDEX) and automated market makers (Uniswap v2 constant-product pools on EVM networks).

## 2. Mathematical Specification

### 2.1 Precision and Integer Arithmetic
To eliminate floating-point rounding errors and precision decay, asset amounts and reserve ratios are calculated using integer fixed-point math with `BigInt` (7 decimal places for Stellar stroops, configurable up to 18 decimals for EVM).

### 2.2 Order-Book Ladder Walking
For order books (Stellar SDEX):
- Orders are sorted by price (bids descending, asks ascending).
- Trades walk the ladder level by level until the requested size is filled or available depth is exhausted.
- Fee deductions are applied based on the venue fee rate ($BPS / 10,000$).
- If requested trade size exceeds total cumulative volume across available price levels, the step is marked `insufficientDepth: true` and `executable: false`.

### 2.3 Constant-Product AMM Formulation ($x \cdot y = k$)
For constant-product pools with reserves $(R_{base}, R_{quote})$ and fee $\gamma = 1 - \frac{feeBps}{10000}$:
- Given base input $\Delta_{base}$, net input is $\Delta'_{base} = \Delta_{base} \cdot \gamma$.
- Net quote output is:
  $$\Delta_{quote} = \frac{R_{quote} \cdot \Delta'_{base}}{R_{base} + \Delta'_{base}}$$
- Effective execution price is:
  $$P_{avg} = \frac{\Delta_{quote}}{\Delta_{base}}$$
- Marginal price after execution:
  $$P_{marginal} = \frac{R_{quote} - \Delta_{quote}}{R_{base} + \Delta'_{base}}$$

### 2.4 Price Impact
Price impact is calculated against the benchmark mid-market price ($P_{mid}$):
$$\text{Price Impact } \% = \frac{|P_{avg} - P_{mid}|}{P_{mid}} \times 100$$

### 2.5 Capacity Calculation
Maximum trade size capacity is computed analytically for standard impact thresholds $[1.0\%, 2.0\%, 5.0\%, 10.0\%]$:
- For AMMs:
  $$\Delta_{base}(I) = R_{base} \cdot \frac{I / 100}{1 - I / 100}$$
- For order books: iterative ladder walk until the cumulative volume causes average price impact to reach the threshold limit.

## 3. Data Provenance and Coverage Lifecycle
Every analysis returns a strict `CoverageReport` classifying data freshness and completeness:

| Status | Definition |
| :--- | :--- |
| `complete` | Real-time order book or pool reserves successfully fetched and fully evaluated. |
| `partial` | Data fetched but contains anomalies (such as crossed order books or negative spreads). |
| `truncated` | Order book levels reached maximum pagination boundary; depth beyond this boundary is unobserved. |
| `stale` | Observed timestamp or block number is behind acceptable latency thresholds. |
| `empty` | Venue returned zero bids and zero asks or zero pool reserves. |
| `unsupported` | Venue model (e.g. Uniswap v3 concentrated liquidity or Curve stableswap) is recognized but requires specialized math not yet enabled. |
| `unavailable` | Upstream RPC or Horizon node failed or timed out. |

## 4. API Endpoints

### 4.1 GET /api/insights/liquidity-depth
Fetches depth curves, size ladders, and threshold capacity for a given pair.

Query Parameters:
- `base` (required): Asset code or address (e.g. `XLM`, `0x...`).
- `quote` (required): Quote asset code or address (e.g. `USDC`, `0x...`).
- `network` (optional): `stellar-pubnet`, `stellar-testnet`, `ethereum`, `base`, `arbitrum`.
- `side` (optional): `buy` (default) or `sell`.
- `sizes` (optional): Comma-separated ladder steps (e.g. `100,500,1000,5000,10000`).

Response Headers:
- `Cache-Control`: `no-store, no-cache, must-revalidate`
- `X-Content-Type-Options`: `nosniff`

Rate Limiting:
- 30 requests per minute per IP address. Exceeding limits returns HTTP 429 with `Retry-After`.

### 4.2 POST /api/insights/liquidity-depth
Accepts a JSON payload with explicit venue configuration and custom capacity thresholds.

## 5. User Interface and Accessibility
The Liquidity Depth analysis workbench is available at `/insights/liquidity-depth`.

Key UI capabilities:
- **Coverage Banner**: Displays real-time data provenance, block/ledger numbers, and model assumptions.
- **Interactive Depth Curve**: Visual chart rendered with Recharts, with an accessible tabular fallback accessible to keyboard users and screen readers.
- **Execution Size Ladder**: Detailed slippage, average price, fees, and executable status badges.
- **Capacity Metric Cards**: Maximum trade capacity at 1%, 2%, 5%, and 10% slippage limits.
