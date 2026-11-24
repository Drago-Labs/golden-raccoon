# Allocation drift

A read-only tracker that compares the holdings a portfolio read returned with a target allocation the user defines, explains how far each position has drifted, and shows how that drift developed across the observations already recorded for that wallet.

## What it measures

- **Target allocation.** The user defines a target by asset or by custom group. Targets are versioned (`version: 1`), stored per wallet and network through the existing browser preference storage, and must total exactly 100% — a target that does not is rejected with a typed error before any calculation runs.
- **Current weights.** Each position's USD market value divided by the observed priced total, expressed in basis points with two decimal places. Arithmetic is integer-only: USD values are parsed into fixed-point units of 10^-8 USD, so no weight depends on binary floating point.
- **Drift.** `current basis points − target basis points`, per asset or group. A positive drift means the position is above target.
- **Drift history.** Every recorded observation of that wallet inside the selected window (at most 90 days), recalculated against the *currently selected* target version, so a history is never a mix of different targets.
- **Threshold crossings.** The observations where a position's **absolute** drift moved above or back below the chosen threshold, reported with the observation time and the drift at that point. Only consecutive recorded observations are compared; nothing between them is interpolated.
- **Restoration amounts.** `total × target ÷ 100% − current value`, as a USD amount and — for asset targets with a usable price — an asset quantity at the observed price. A negative amount means the position holds too much value, a positive one too little.

## Worked example (the recorded fixture)

`tests/features/allocation-drift/data/drifted-portfolio.json` records a 100,000 USD portfolio holding 60,000 USD of WETH at 2,500 USD, against a 50% WETH target:

- current weight: `60,000 / 100,000 = 60% = 6,000 bps`
- drift: `6,000 − 5,000 = +1,000 bps`
- restoration: `100,000 × 50% − 60,000 = −10,000 USD`, which is `−10,000 / 2,500 = −4 WETH`

`tests/features/allocation-drift/drift.test.ts` asserts exactly these values, and `docs/features/allocation-drift-evidence.md` repeats the calculation for every row of the fixture.

## Not in scope

- **No rebalancing.** Restoration amounts are informational arithmetic only. This feature builds no transaction, no call data and no signing material, and has no submit path; `tests/features/allocation-drift/service.test.ts` asserts the response carries none.
- **No price or holding inference.** When the portfolio read cannot price a holding, weights, drift and restoration amounts are reported as unavailable rather than treating that holding as zero, and the report is marked `partial` with the reason listed in its coverage notes.
- **No history reconstruction.** The feature recalculates observations that were already recorded locally; it does not fetch historical balances or back-fill a window it has no observation for.

## Module layout

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod request, snapshot and target schemas; the exported result types. |
| `targetDefinition.ts` | Percentage → basis-point conversion and building a target from editor rows. |
| `targetValidation.ts` | The 100% rule, unique keys, one asset per group, asset-target self-identity. |
| `targetStorage.ts` | Versioned, wallet-and-network-scoped preference storage for targets and observations. |
| `weights.ts` | Fixed-point USD helpers, portfolio-read normalization, current weights. |
| `drift.ts` | One observation against a target: current, target, drift, restoration per row. |
| `driftHistory.ts` | Scope and window filtering, deduplication, ordering of recorded observations. |
| `thresholds.ts` | Crossings between consecutive observations, compared in hundredths of a basis point. |
| `restoreAmounts.ts` | Restoration amounts in USD and asset quantity. |
| `coverage.ts` | What the answer does and does not cover, as plain notes. |
| `errors.ts` | `AllocationDriftError` and its `invalid_request` / `unavailable` / `malformed_snapshot` codes. |
| `limits.ts` | Request size, holding, target, observation and window bounds. |
| `service.ts` | Composition and the production portfolio reader. |
| `index.ts` | The only public entry point. |

The page lives at `/insights/allocation-drift` (`src/app/insights/allocation-drift/page.tsx`), composed from `src/components/research/allocation-drift/`: `DriftTracker.tsx` (workspace root), `PortfolioSelector.tsx`, `TargetEditor.tsx`, `DriftTable.tsx`, `DriftHistoryChart.tsx` (chart plus a full text-alternative table), `ThresholdSettings.tsx`, `CoverageNotice.tsx` and `useWorkbenchState.ts`.

## Run the focused suite

```
npx vitest run tests/features/allocation-drift
```
