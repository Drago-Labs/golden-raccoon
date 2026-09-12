# Liquidity depth workbench

A quote describes one proposed size. This workbench describes the shape behind
it: visible depth, price impact across a ladder of sizes, and exactly where the
data stops.

## What it will not do

It is informational. There is no code path that produces an executable quote,
selects a production route, or prepares a transaction, and the payload carries
`informationalOnly: true`. A domain test walks every key of the response and
asserts that no field named `route`, `calldata`, `xdr`, `envelope`,
`transaction`, `signature`, `deadline`, `slippageTolerance` or `minAmountOut`
exists anywhere in it.

## Two models, never mixed

| Model | Source of the numbers |
| --- | --- |
| `orderbook` | The levels present in the snapshot. Cumulative depth stops where the levels stop. |
| `constant_product` | The `x·y=k` curve, derived analytically from the reserves and fee. Labelled a model, not an observation. |
| `unsupported_model` | Nothing. The venue is shown with `state: "unavailable"` and every rung marked `not_modelled`. |

A venue whose mechanics are not implemented is reported honestly rather than
approximated with maths that does not apply to it.

## Arithmetic

Every amount is an integer count of base units in a `bigint`; prices are parsed
from decimal strings into a `10^18`-scaled integer. Nothing passes through a
binary float, so an 18-decimal token keeps every digit.

Both assets' scales enter a price conversion:
`quote = base / 10^baseDecimals · price · 10^quoteDecimals`. Using one asset's
decimals silently returns whole units instead of base units — a bug the fixtures
caught during development.

Division truncates in the taker's disfavour, and a price with more precision
than the scale supports is truncated rather than rounded up, so the report never
claims depth at a price the venue did not offer.

### Worked fixtures

Selling 150 XLM into a book of `0.50 / 0.49 / 0.45`:

```
100 XLM @ 0.50 = 50.0 USDC
 50 XLM @ 0.49 = 24.5 USDC
                 --------
                  74.5 USDC  -> 745_000_000 base units (7dp)
effective price = 74.5 / 150 = 0.496666666666666666
impact vs 0.50  = 66 bps
```

Selling 1 WETH into a 1000 WETH / 3 000 000 USDC pool at 30 bps:

```
dx_net = 10^18 · 9970/10000        = 997_000_000_000_000_000
dy     = y · dx_net / (x + dx_net) = 2_988_020_943 USDC base units
```

Both are asserted exactly in the focused suite.

## Snapshots that cannot yield an unqualified result

- **Crossed book** — best bid at or above best ask. The snapshot is internally
  inconsistent, or the pair orientation is reversed. Refused.
- **Zero reserve** — a constant-product curve is undefined. Refused.
- **Stale** — older than 120 seconds. Analysed, with the age stated.
- **Truncated** — the source said more exists. Capacity beyond the last level is
  reported "unknown, not absent".
- **Empty taker side** — `insufficient_depth`, never a zero-cost fill.

A size larger than the visible book is returned with the fillable portion and a
`partial` status, never silently clamped to the book's total.

## Modules

`frontend/src/server/research/liquidity-depth/`: `schema`, `orderbookAdapter`,
`poolAdapter`, `amountMath`, `depthCurve`, `priceImpact`, `capacity`,
`coverage`, `service`.

`frontend/src/components/research/liquidity-depth/`: `LiquidityWorkbench`,
`VenueSelector`, `DepthChart`, `SizeLadder`, `CoverageNotice`.

## Entry points

- Page: `/insights/liquidity-depth`
- API: `POST /api/insights/liquidity-depth`
- Link: "Liquidity depth workbench" on `TokenTable`.

## Accessibility

The size ladder table is the canonical view; `DepthChart` is `aria-hidden` and
plots only points that are already table rows. The venue picker is a
`radiogroup` with `aria-checked`. Assumptions and qualifications are lists, not
one sentence, so each condition can be read separately.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/liquidity-depth
npx --prefix frontend playwright test e2e/specs/liquidity-depth.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-liquidity-depth.yml`.

## Fixture assumptions

`frontend/tests/features/liquidity-depth/fixtures.ts` carries the arithmetic for
each case in comments beside it, so a reviewer can check the maths without
running the code. Fixtures cover orderbook-multiple-levels,
constant-product-fee-and-rounding, stale/truncated/unsupported, crossed book,
zero-reserve pool, empty book, and the same symbol on two networks. Assets use
7, 6 and 18 decimals so precision handling is exercised. Nothing touches a
network or a paid provider.

## Out of scope

Best-route aggregation, execution price proofs, transaction simulation, trade
submission and support for every AMM model.
