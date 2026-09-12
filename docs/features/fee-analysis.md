# Network fee attribution and efficiency analytics

## Why this exists

Transaction history shows what happened. It does not show what it cost, who
the chain actually charged, or where the money went by operation and period.
This feature answers those questions from finalized records — and refuses to
answer them where the evidence is missing.

## Two refusals

**1. It will not estimate a fee it did not observe.**

A charge is read from a receipt or from transaction metadata, or it is
`unknown`. An unknown charge is carried through every aggregation as its own
state: counted in `unknownCount`, contributing nothing to `observedBaseUnits`.
A total that quietly treats missing data as zero is worse than no total,
because it looks complete.

**2. It will not produce a fiat figure without timestamped conversion
evidence.**

Fees are charged in the network's own asset. Collapsing several assets into one
dollar number needs a price *and* the moment that price was true, and both
travel with the figure in `FiatTotal`. A fiat total with no `pricedAt` is not
constructible from the type.

A fiat figure is also withheld when any charge in that asset group is unknown —
a dollar total over a partial set reads as a total over all of it.

## Counting each economic event once

The subtlest correctness problem here is double-counting. A wallet's history
contains the same event more than once in two different ways, and both are
handled in `transactionAdapter.ts`:

| Case | Handling |
| --- | --- |
| **Replacement** — a transaction was sped up or cancelled | The superseded hash is excluded with `supersededBy` naming the hash that carries the charge |
| **Duplicate observation** — one hash appears twice in the records | One hash, one charge; the repeats are excluded as `duplicate_observation` |

And the case a naive filter gets backwards: **a failed transaction that was
still charged stays in the totals.** Gas is spent on reverting. Filtering to
successes would understate what the wallet paid.

## Exact arithmetic

Every sum is `bigint`. A fee is an integer count of the smallest unit — wei,
stroops — and doubles cannot hold those magnitudes without losing the low
digits. The test suite demonstrates the difference directly:

```
Number("21000000000000001") + Number("21000000000000001")  → 42000000000000000
sumBaseUnits(["21000000000000001", "21000000000000001"])   → 42000000000000002
```

Rendering uses digit surgery rather than division, so `21000000000000000` wei
formats as `0.021` and not `0.020999999999999998`. Floating point appears in
exactly one place: the fiat conversion, which is an approximation by nature and
is labelled with the price and time that produced it.

## Payers, including the one who is not the sender

On Stellar, a fee bump means the account that *pays* is not the transaction's
source. Both are read from the metadata and both are reported — `payer`,
`feeBumpPayer` and `originalSource` — so grouping by payer does not bill the
wrong account. Where one account paid for itself, the fee-bump fields are null
rather than repeating the source.

A Soroban resource fee is added to the base fee, because the ledger charged it
as one amount, and the provenance string names both components.

On EVM the charge is `gasUsed × effectiveGasPrice`, plus the rollup L1 data fee
where the network reports one.

A refund is only ever set from a field the chain reported. **Nothing infers
one**, because an inferred refund makes a total smaller than the wallet
actually paid.

## Wallet scoping

The request names the accounts it is asking about: `walletAddress`, and
`stellarAccount` when the user has one. A wallet is not one address across
chain families, and a Stellar record's owner is its `sourceAccount`. A record
whose owner is not an account the caller named is excluded as `other_wallet`
and reported — never silently aggregated.

## What it does not touch

The lifecycle store is an input. No record is written, no finality state is
recomputed, and nothing here affects what a future transaction pays — the
`FeeReader` port has two read methods and nothing that could submit. The report
says so in `readOnly` and `feePolicyUnchanged`, and a test asserts the supplied
records are byte-identical afterwards.

## States

| Coverage | Meaning |
| --- | --- |
| `complete` | Every charge was read from a receipt or from metadata |
| `partial` | Some charges were not readable; totals cover only those that were |
| `empty` | No records in the window, or every record was excluded — a success |
| `unavailable` | Records exist but no fee could be read for any of them |

## Layout

```
frontend/src/server/research/fee-analysis/
  schema.ts             contract, limits, the FeeReader port
  unitMath.ts           bigint arithmetic; formatting without a float detour
  transactionAdapter.ts replacement and duplicate handling, wallet scoping
  evmReceipt.ts         gasUsed × effectiveGasPrice, plus L1 data fee
  stellarMeta.ts        feeCharged, fee-bump payer, resource fee
  payerAttribution.ts   one source of evidence per charge, named
  aggregation.ts        by network, asset, category, time bucket
  coverage.ts           what the totals do not cover, and why no fiat total
  service.ts            public entry; enforces the shared read budget
frontend/src/components/research/fee-analysis/
  FeeAnalysisWorkspace.tsx  workspace; keyed by account and network
  PeriodSelector.tsx        window resolved client-side into explicit timestamps
  FeeBreakdown.tsx          per-asset; no cross-asset column exists
  CostTimeline.tsx          table with bars; the number is the fact
  CoverageTable.tsx         unreadable charges and excluded records
frontend/tests/features/fee-analysis/
```

Entry point: `frontend/src/components/RecentTransactions.tsx`.

The period is resolved into explicit `from`/`to` timestamps in the browser
before the request is sent. A relative window evaluated on the server would
make the same request return different numbers depending on when it arrived.

## Verification

```
cd frontend
npm run test:fee-analysis     # or: npx vitest run tests/features/fee-analysis
npx playwright test e2e/specs/fee-analysis.spec.ts
```

The focused suite runs on every pull request through
`.github/workflows/feature-fee-analysis.yml`. Fixtures are plain
`TransactionRecord` objects and a map from hash to what a receipt or metadata
read would have returned — no chain, no database, no clock. The route tests
mock storage and both chain sources, so wallet scoping is covered without
either. No funds, keys or paid services are involved.
