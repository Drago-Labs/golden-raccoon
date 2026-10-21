# Score calibration report — sources and limits

## Data sources

- `listRiskPublicationHistory` (`server/stellar/riskHistory.ts`) — the
  existing, already-exported read API for this app's score-publication
  history. `snapshotReader.ts` only calls this function; it never
  imports the module's internal store, never calls
  `recordRiskPublication`, and never calls `resetRiskPublicationHistory`.
- Stellar Horizon's `/trade_aggregations` endpoint
  (`https://horizon.stellar.org` pubnet, `https://horizon-testnet.stellar.org`
  testnet) — for the `large_drawdown` outcome only.
- No other third-party API or database is used.

## What was verified before writing the drawdown detector

A real `base_asset=<asset>, counter_asset=native` query against pubnet
Horizon was run before `outcomeDetection.ts` was written. Each
aggregation record's `open`/`low`/`high`/`close` fields are the asset's
price in XLM per unit for that bucket — exactly the asset-relative price
series `detectLargeDrawdown` needs, with no further unit conversion.

## Why `depeg` and `incident_report` have empty registries

Both detectors are fully implemented and tested against fixtures, but
`PEG_REGISTRY` and `INCIDENT_LOG` in `outcomeDefinitions.ts` start empty:

- A genuine depeg check needs a USD (or other peg-target) reference
  price. Stellar's DEX prices everything against other Stellar assets,
  not a USD oracle, and this app does not have one. Seeding the registry
  with a guessed reference would misrepresent what was actually checked.
- A genuine incident check needs a durable, already-trustworthy incident
  log. No such store exists elsewhere in this app yet —
  `incident-status`'s research feature analyzes caller-supplied evidence
  per request rather than keeping its own history, so there was nothing
  safe to read from automatically.

Selecting either outcome type today returns a `200` with every readable
snapshot excluded as `outcome_not_configured`, and `coverage.state:
"unavailable"` — not a fabricated calibration. This is a conscious
scope decision, not an oversight: a maintainer who later adds a price
oracle or an incident store only needs to populate the two registries in
`outcomeDefinitions.ts`; the detection, exclusion, bucketing, and
reporting logic around them is already complete and tested.

## Bounds

| Bound | Value |
| --- | --- |
| Horizon fetch timeout | 8,000 ms |
| Max snapshots read per report | 2,000 (newest first) |
| Max price-aggregation points read per outcome check | 200 |
| Minimum bucket sample size before a rate is flagged imprecise | 10 |
| Max request body size | 4,096 bytes |

## Confidence intervals

Each bucket's interval is a 95% Wilson score interval, not the simpler
normal approximation — the Wilson interval stays within `[0, 1]` and is
far less overconfident at the sample sizes a single score bucket often
has. `sufficientSample` is a separate, simpler flag (sample size ≥ 10)
shown alongside the interval so a reader does not have to interpret
interval width themselves to see that a bucket is thin.

## Score buckets

Scores are grouped into five fixed buckets: `0-20`, `20-40`, `40-60`,
`60-80`, `80-100`, each inclusive of its low bound and exclusive of its
high bound except the last, which includes 100.
