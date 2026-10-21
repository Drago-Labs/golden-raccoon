# Ledger capacity and fee surges

## Why this exists

A transaction that fails for an insufficient fee, or that sits unconfirmed, does not say whether the network was full. Fee snapshots say what the fee is now. They do not say what the ledger could hold at the time, whether surge pricing was in effect, or which part of a Soroban fee was the inclusion bid and which part was resources.

This feature reads a bounded window of closed ledgers and explains those three things. It does not recommend a fee for a future submission, and it does not build a transaction.

## Capacity

Each ledger header carries `tx_set_operation_count` and `max_tx_set_size`. Usage is integer basis points:

```
usageBasisPoints = floor(operationCount * 10000 / maxOperations)
```

A ledger is full when `maxOperations > 0` and `operationCount >= maxOperations`. That is the capacity surge pricing reacts to. A maximum of zero is unknown usage, not 0% and not full.

The mean is the integer mean of those basis points over ledgers that were present. A missing sequence is not inserted as a zero-usage ledger. Doing that would make a hole look like a quiet ledger and pull the mean down.

## Gaps

The window is inclusive: sequences `fromSequence` through `toSequence`. Any sequence the reader did not return is a gap. Adjacent missing sequences collapse into one range. Gaps are rendered in the capacity table and are excluded from:

- the usage mean
- surge runs (a hole breaks contiguity)
- every fee percentile

An empty window, where nothing was present, is a successful empty result. It is not a provider failure and it is not a network that charged zero.

## Surge periods

A surge period is a maximal run of full ledgers whose sequence numbers increase by exactly one. A missing sequence, or a ledger that was not full, ends the run.

The inclusion floor of a period is the lowest per-operation inclusion fee among included transactions in that run. Classic and Soroban inclusion floors are computed separately. A period is `pricedAboveBase` when either floor is strictly greater than the lowest base fee in the run. A full ledger whose floor equals the base fee is still listed: capacity was full, and the price did not rise.

Soroban resource fees are not an input to the floor. Surge pricing ranks inclusion bids. Resource fees are a different charge.

## Percentiles

One sample is one included transaction, successful or failed. A failed transaction was still included and still charged, so dropping it would understate the fee that cleared the ledger.

The sample value for an inclusion fee is

```
floor(inclusionFeeStroops / operationCount)
```

using integer division. The resource-fee sample is the resource fee itself, in stroops, and is not divided by the operation count.

Percentiles are nearest-rank, with the rank computed in integers so the result does not depend on floating point:

```
rank = (percentile * n + 99) / 100
value = sortedAscending[rank - 1]
```

`percentile` is 50, 90, or 99. An empty sample has null percentiles, not zero.

Worked example from the surge fixture. Classic per-operation samples, in stroops:

```
200, 200, 400, 1000, 1000
```

`n = 5`. p50 rank is `(50 * 5 + 99) / 100 = 3`, so the third sample, `400`. p90 and p99 rank are `(90 * 5 + 99) / 100 = 5` and `(99 * 5 + 99) / 100 = 5`, so the last sample, `1000`.

The same window's Soroban transaction charged 2000 stroops of inclusion across 2 operations (`1000` stroops/op) and 3000 stroops of resource fee. Those two numbers are never added, and `5000` is not a percentile.

## Soroban split

For a Soroban transaction the meta relation is:

```
resourceFeeCharged = totalNonRefundableResourceFeeCharged + totalRefundableResourceFeeCharged
feeCharged = resourceFeeCharged + inclusionFeeCharged
```

`rentFeeCharged` is already inside the refundable component. It is reported next to the resource fee and is not added again. A classic transaction has no resource component; its charged fee is the inclusion fee.

If the meta is missing, the components disagree (rent larger than the refundable fee, or resource fee larger than `feeCharged`), the transaction is `unsplit`. It is left out of both the classic series and the Soroban series. It is not guessed into either.

## Timestamp lookup

A moment maps to the greatest ledger whose close time is at or before that moment. A moment after the latest close has no ledger yet. A moment before every probed close is not assigned ledger 1 by default.

The search is centred with a nominal five-second close, then bounded by `timestampSlackLedgers`, and it stops at `maxTimestampProbes`. The header's close time decides. The five-second figure is only a centre, because a slow close would otherwise walk the chain.

Looking up a ledger, or a resolved timestamp, widens the window by `radius` sequences (default 4, maximum 20) and still reports gaps inside that span.

## What the report refuses to do

There is no combined fee field. Classic inclusion, Soroban inclusion, and Soroban resource fees are three distributions with different units: stroops per operation, stroops per operation, and stroops. The page renders them in separate tables.

The reader is an argument of `explainCongestion`. Recorded windows never open a socket. The Horizon implementation takes its host from the project's Stellar config, not from the request.

## Layout

```
frontend/src/server/research/network-congestion/
  schema.ts            request, report, and the separated fee distributions
  networkIdentity.ts   public or testnet passphrase
  ledgerReader.ts      Horizon read port; meta is classified here
  capacity.ts          usage, fullness, gaps, mean
  surgeDetection.ts    contiguous full runs and inclusion floors
  feePercentiles.ts    nearest-rank percentiles
  sorobanFees.ts       inclusion, resource, and rent
  timestampLookup.ts   close time to ledger, and radius
  coverage.ts          complete, partial, or empty
  errors.ts            typed errors and the workbench state union
  limits.ts            window, page, timeout, and probe bounds
  service.ts           explainCongestion
  index.ts             public entry
frontend/src/components/research/network-congestion/
  CongestionWorkbench.tsx
  WindowInput.tsx
  CapacityChart.tsx
  SurgePeriodList.tsx
  FeePercentiles.tsx
  CoverageNotice.tsx
  useWorkbenchState.ts
```

The page is `frontend/src/app/insights/network-congestion/page.tsx`. The route is `frontend/src/app/api/insights/network-congestion/route.ts`.

## Verification

```
cd frontend
npx vitest run tests/features/network-congestion
```

Fixture tests inject a ledger reader. They do not call Horizon. A further check is to load a short public-network window and compare `sequence`, `tx_set_operation_count`, `max_tx_set_size`, and `fee_charged` with a block explorer. The percentile arithmetic above can be repeated on those fees by hand.
