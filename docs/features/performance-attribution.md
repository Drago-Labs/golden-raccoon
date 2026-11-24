# Portfolio performance attribution

A read-only report that breaks a portfolio's observed change in value into what entered or left the portfolio and what the market did, per asset, chain and period.

## The method

For each period, with `V0` and `V1` the observed values at its bounding observations and `F` the external flows inside it:

```
change       = V1 − V0
market       = change − F                              flows are never a return
price effect = start quantity × (end price − start price)
residual     = market − price effect
```

Per asset, the same four figures are computed from that asset's own holdings and flows. The residual is *defined* as the rest of the market movement, so for every asset and every period:

```
external flows + price effect + residual = observed change        (exactly)
```

That identity is what makes the report checkable: the price effect explains the movement on the units held at the start of the period, and the residual covers movement on units acquired or released during it — including the truncated remainder of the fixed-point multiplication, so no rounding is hidden. Chain figures are the asset figures rolled up by chain.

Every amount is an integer: USD at 10⁻⁸ and quantities at 10⁻¹⁸. No attribution figure passes through binary floating point, and truncation is always towards zero.

## Worked example (the recorded fixture)

`tests/features/performance-attribution/data/large-deposit.json` records a wallet holding 10 WETH at 2,000 USD, which receives a 10,000 USD transfer of 5 WETH mid-period, with WETH ending at 2,100 USD:

| Figure | Value | Why |
|---|---|---|
| Start value | 20,000 | 10 × 2,000 |
| End value | 31,500 | 15 × 2,100 |
| Change | +11,500 | 31,500 − 20,000 |
| External flows | +10,000 | the recorded transfer |
| Market | +1,500 | 11,500 − 10,000 |
| Price effect | +1,000 | 10 × (2,100 − 2,000) |
| Residual | +500 | 5 × (2,100 − 2,000), the units acquired mid-period |

`10,000 + 1,000 + 500 = 11,500`. `attribution.test.ts` and `service.test.ts` assert exactly these numbers.

## What counts as an external flow

External flows are read from the existing transaction-history read API. Only settled `transfer` records of the requested portfolio count. A **swap is not an external flow** — it exchanges one holding for another inside the same portfolio, so counting it would add and remove the same value — and an unsettled record is not evidence yet. A flow exactly on a period boundary belongs to the period that starts there, so no flow is counted twice or lost between periods; a flow at the very end of the window is counted in the closing period.

A flow names its asset by symbol while a snapshot names it by contract identity, so a flow is matched to its holding by either name. A flow whose asset appears in neither bounding observation keeps its own row, labelled, rather than being dropped.

## Missing data is labelled, never filled

- A period with no observation at or before its start, or none inside it, is reported as `unavailable`: no value is carried over from a neighbouring period and nothing is interpolated.
- A holding with no usable price keeps a null value rather than a zero, so an unpriced asset never reads as a total loss. The period is then `partial`, and the assets that *were* priced on both sides are still attributed.
- When any period's figure is unknown, the report's total for that figure is `null` rather than a sum of the periods that happened to work.
- If the transfer history fills the reader's page budget, that is stated: the separation of flows from market movement is then incomplete.

## Not in scope

- **No tax reporting and no advice.** This attributes observed value. It does not compute cost basis, realized gains, holding periods or any tax figure, and it recommends nothing.
- **No storage changes.** Observations and transfer history are read through the existing read APIs; nothing is written back.

## Module layout

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod request, observation and flow schemas; the exported report types. |
| `portfolioInput.ts` | Portfolio identity scoping and normalizing one observation into integer units. |
| `snapshotReader.ts` | The portfolio read API's shape, and collecting/ordering observations. |
| `flowReader.ts` | Paging the transaction-history read API and normalizing external flows. |
| `flowSeparation.ts` | Assigning flows to periods and netting them per asset and chain. |
| `assetAttribution.ts` | Change, market movement, price effect and residual per asset. |
| `chainAttribution.ts` | The same figures rolled up per chain. |
| `periods.ts` | Window resolution, UTC period alignment, and bounding observations. |
| `decimalMath.ts` | Fixed-point parsing, rendering, multiplication and shares. |
| `coverage.ts` | Why a period is partial or unavailable, and the report's notes. |
| `errors.ts` | `AttributionError` and its typed codes. |
| `limits.ts` | Window, period, observation, flow and size bounds. |
| `service.ts` | Composition and the production readers. |
| `index.ts` | The only public entry point. |

The page lives at `/insights/performance-attribution`, composed from `src/components/research/performance-attribution/`: `AttributionReport.tsx` (workspace root), `PortfolioSelector.tsx`, `PeriodSelector.tsx`, `AttributionTable.tsx`, `WaterfallChart.tsx` (chart plus a full text-alternative table), `CoverageNotice.tsx` and `useWorkbenchState.ts`.

## Run the focused suite

```
npx vitest run tests/features/performance-attribution
```
