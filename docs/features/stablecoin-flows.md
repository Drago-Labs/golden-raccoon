# Stablecoin mint and burn flows

A read-only view of what each chain recorded as issued and redeemed for one configured stablecoin, aggregated by UTC day, with net issuance, the largest single events and an explicit statement of what the evidence does not cover.

## What it reads

- **EVM chains:** the token contract's `Transfer(address,address,uint256)` logs where one side is the zero address. A transfer *from* the zero address is a mint; a transfer *to* it is a burn. Nothing else counts, and a transfer between two zero addresses counts in neither direction.
- **Stellar:** payments out of and into the issuing account for the classic asset. Issuance of a classic Stellar asset *is* a payment from its issuer, and redemption is a payment back to it, so this is the issuer's own ledger record. Another asset, a payment between two third parties, or any non-payment operation on the same account is dropped rather than counted.

Which contract or issuer counts as a given stablecoin is configuration, not discovery: `assetRegistry.ts` is the only place that says so, and every deployment carries the issuer's own published contract list as its source.

## What it computes

- **Daily totals** per UTC day and chain: minted, burned, net and the number of events. Every day the window touches gets a row for every chain that was read, so a quiet day reads as a zero rather than as a gap.
- **Net issuance** across the window — minted minus burned — overall and per chain, so a chain that minted is not hidden by one that burned.
- **The largest single events**, ranked by amount regardless of direction, each keeping the transaction it came from and a link to that chain's public explorer.
- **Coverage per chain**: complete, incomplete (the provider page filled up, or the derived read range could not reach the start of the window) or not read at all.

All arithmetic is integer-only. Each chain's raw amount is rescaled to one canonical scale per asset — the largest decimals of any of its deployments — so rescaling is always an exact multiplication: USDC is 6 decimals on EVM chains and 7 on Stellar, so the canonical scale is 7; USDT is 6 on most chains and 18 on BNB Chain, so its canonical scale is 18. No amount is ever divided, rounded, or converted to a price.

## Worked example (the recorded fixture)

`tests/features/stablecoin-flows/data/multi-chain-flows.json` records one window of USDC flows on `ethereum` and `stellar`:

| UTC day | Chain | Minted | Burned | Net |
|---|---|---|---|---|
| 2026-11-18 | ethereum | 1,000,000 | 250,000 | +750,000 |
| 2026-11-18 | stellar | 50,000 | 0 | +50,000 |
| 2026-11-19 | ethereum | 0 | 400,000 | −400,000 |
| 2026-11-19 | stellar | 10,000 | 0 | +10,000 |

Minted 1,060,000 and burned 650,000 leaves **net issuance of 410,000 USDC** across the window: +350,000 on Ethereum and +60,000 on Stellar. `tests/features/stablecoin-flows/aggregation.test.ts` and `service.test.ts` assert exactly these figures, and `docs/features/stablecoin-flows-evidence.md` shows the per-event arithmetic.

## Not in scope

- **No forecasting.** The feature states what was issued and redeemed. It does not predict, score or explain peg behaviour, and it reads no price at all.
- **No inference.** A chain that could not be read contributes no row: a zero there would read as "nothing was issued", which is not what was observed. Such a chain is named in the coverage table and in the report notes, and left out of every total.
- **Read-only.** No mint, burn, transfer or any other write exists in this feature.

## Module layout

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod request schema and the exported event, daily, coverage and report types. |
| `assetRegistry.ts` | The configured stablecoins, their per-chain deployments, decimals, block times and published sources. |
| `evmEvents.ts` | `eth_getLogs` paging for zero-address `Transfer` logs plus the block timestamps they need. |
| `stellarEvents.ts` | Horizon paging over the issuing account's payments, stopping at the start of the window. |
| `normalization.ts` | Exact rescaling, decimal rendering, and raw provider rows into canonical flow events. |
| `windowing.ts` | Window resolution, UTC-day bucketing, and deriving a block range for a time window. |
| `dailyAggregation.ts` | Integer totals per UTC day and chain. |
| `netIssuance.ts` | Net issuance across the window, overall and per chain. |
| `largeEvents.ts` | Stable ranking of the largest single events. |
| `coverage.ts` | Per-chain coverage, the report-level state, and the report's plain-language notes. |
| `errors.ts` | `StablecoinFlowError` and its typed codes. |
| `limits.ts` | Request size, timeout, window, paging and ranking bounds. |
| `service.ts` | Composition, per-chain failure isolation, and the production readers. |
| `index.ts` | The only public entry point. |

The page lives at `/insights/stablecoin-flows` (`src/app/insights/stablecoin-flows/page.tsx`), composed from `src/components/research/stablecoin-flows/`: `StablecoinFlows.tsx` (workspace root), `AssetSelector.tsx`, `WindowSelector.tsx`, `FlowChart.tsx` (chart plus a full text-alternative table), `EventList.tsx`, `CoverageNotice.tsx` and `useWorkbenchState.ts`.

## Run the focused suite

```
npx vitest run tests/features/stablecoin-flows
```
