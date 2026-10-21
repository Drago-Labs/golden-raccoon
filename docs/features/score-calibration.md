# Score calibration report

## Why this exists

A score explanation shows why a score was given. It says nothing about
whether scores at that level have actually tracked reality. This report
reads the history of scores this app has already produced, checks a
documented outcome within a stated time horizon, and reports how often
that outcome followed — bucketed by score, with sample sizes and
confidence intervals that say when a rate is too thin to trust.

## The rule that shapes the output

**This report never retrains, adjusts, or comments on the scoring
model.** `scoringModelUnchanged` is hard-coded to `true`. It reads the
existing score-publication history through `listRiskPublicationHistory`
and never writes to it, resets it, or imports its internal store.

## What it reads

| Input | Source |
| --- | --- |
| Historical score snapshots | `listRiskPublicationHistory` in `server/stellar/riskHistory.ts` — an existing read API, used as-is |
| Outcome evidence | A documented detector per outcome type — see below |

## Outcome types

| Type | How it is checked |
| --- | --- |
| `large_drawdown` | The asset's price against XLM, read from Stellar Horizon's trade-aggregation API, fell by at least 50% from its price at snapshot time to its lowest point within the horizon. Fully implemented; only works for classic `CODE:ISSUER` assets with trade history. |
| `depeg` | Would compare the asset's price against a documented peg target. The detector is fully implemented, but `PEG_REGISTRY` is empty — this app has no USD reference price feed, so every snapshot is excluded with `outcome_not_configured` rather than a fabricated rate. |
| `incident_report` | Would check a documented incident log for the asset within the horizon. The detector is fully implemented, but `INCIDENT_LOG` is empty for the same reason: no durable incident store exists elsewhere in this app yet. |

`depeg` and `incident_report` are real, not placeholders that silently
return zero — see `score-calibration-evidence.md` for exactly what a
caller sees today when selecting either.

## Why snapshots get excluded, not scored as "no"

A snapshot is excluded, never silently treated as a negative outcome,
when:

- its horizon has not elapsed yet (`horizon_not_elapsed`) — there is
  nothing to observe;
- its asset type has no outcome check configured
  (`unsupported_asset_type` for a non-classic asset under
  `large_drawdown`, or `outcome_not_configured` for an unconfigured
  outcome type); or
- the price data needed to check it could not be read
  (`price_data_unavailable`).

Excluded snapshots are counted and listed with their reason in
`excludedSnapshots`, so the report is honest about how much of the
history it could actually use.

## Small buckets are flagged, not hidden

A bucket's observed rate is always shown, even with one included
snapshot. `sufficientSample` is `false` below
`SCORE_CALIBRATION_LIMITS.minBucketSampleSize` (10), and the Wilson
confidence interval widens accordingly — a thin bucket looks thin, it is
never presented with the same confidence as a well-sampled one.
