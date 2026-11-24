# Performance attribution — sources and limits

## Sources

| Input | Source | Notes |
|---|---|---|
| Recorded portfolio observations | The offline portfolio capture store this browser already holds (`@/lib/offlineStore`), normalized through the same path as a live read | Supplied in the request. An observation of another wallet or network is refused, not dropped, so a report can never mix portfolios. |
| The latest observation (optional) | `getPortfolioSnapshot` — the existing portfolio read API | Only when `includeLiveSnapshot` is set. A `connected` read is required; any other status is reported, and the recorded observations are used alone. |
| External flows | `listTransactionRecordsPaginated` — the existing transaction-history read API | Settled `transfer` records of this portfolio only. Swaps and unsettled records are excluded by design. |

Nothing is written: no storage, snapshot or history record is created or modified by this feature.

## Hand-checkable fixtures

`large-deposit.json` — 10 WETH at 2,000 USD, a recorded 10,000 USD transfer in mid-period, ending at 15 WETH at 2,100 USD:

```
change 11,500 = flows 10,000 + price effect 1,000 + residual 500
```

`steady-portfolio.json` — no external flow across two days: 10 WETH from 2,000 → 2,200 → 2,100 plus a flat 5,000 USDC. Day one is `+2,000` and day two `−1,000`, each entirely the price effect, with a residual of exactly zero. The same recorded history page also holds a **swap** of 1,234.50 USD and an **unsettled** transfer of 500 USD; neither is counted, which is what keeps both days' flows at zero.

`missing-prices.json` — the same wallet where GOAT loses its price on the second observation and no observation exists after it. The first period is `partial` (WETH still attributed at `+1,000`, GOAT stated as unavailable), and the two later periods are `unavailable` and named in the coverage notes.

`provider-unavailable.json` — the transaction-history read API returns no items. Nothing is attributed: every period is `unavailable`, every total is `null`, and the report states why.

## Limits

- **Observed values only.** Change is measured between recorded observations; nothing is interpolated between them, and no value is carried across a period with no observation.
- **Unpriced is not zero.** An asset with no usable price on a side is reported as unavailable, and any total that would need it is `null`.
- **The residual is a bucket, not a measurement.** It is the market movement the start-of-period price effect does not explain: movement on units acquired or released mid-period, plus the truncated remainder of the fixed-point multiplication. It is labelled as such and never presented as a separate cause.
- **Flow values are the provider's.** A transfer's USD value is the one the transaction-history record carries; a record with no recorded value is reported rather than treated as zero.
- **Bounds** (`limits.ts`): 370-day window, 120 periods, 400 observations, 200 holdings per observation, 500 flow records over at most 5 pages of 200, 262,144 request bytes, 8-second provider timeout.
- **Not tax reporting.** No cost basis, no realized/unrealized split, no holding periods, no advice. The repository's separate cost-basis engine is untouched by this feature.
