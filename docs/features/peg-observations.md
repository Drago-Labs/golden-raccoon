# Peg deviation workspace

Inspects observed deviations of a stable asset from **its own declared peg**,
over a bounded window, with the gaps in the data named rather than drawn over.

## The assumption this feature refuses

A "stable" label does not imply a one-dollar target. A peg here is always an
explicit triple — reference currency, target value, and where the claim came
from — and there is no default:

- `PegProvenance` has no `assumed` member. Declarations come from an issuer
  disclosure, a prospectus, protocol documentation, or an operator.
- An asset with no declaration is listed in `undefinedAssets` and **not
  analysed**. It is never measured against one dollar.
- The declaration form offers no pre-filled currency or target, because
  pre-filling "USD" and "1.00" would quietly reintroduce the assumption.

A EURC pegged at 0.83 EUR reads as −100 bps against its own target. Against an
assumed dollar it would read as −1783 bps — a fabricated catastrophe. The
fixtures assert the former.

## Sparse data rules

Observations are sparse by nature, so three rules keep conclusions inside what
was actually seen:

1. **Gaps are recorded.** Consecutive observations more than `maxGapSeconds`
   apart produce an `ObservationGap` whose note says "neither that it held nor
   that it broke". The chart breaks its line across them.
2. **Episode boundaries are observed points.** An episode opens at the first
   observation at or beyond the threshold and closes at the first observation
   back inside it. Nothing is interpolated, so a duration is always "between two
   things we saw". A gap inside an episode marks the duration a lower bound.
3. **No observed recovery is not a failure.** `recoveredAt: null` says recovery
   was not observed — explicitly not that it did not happen.

An unconverted observation neither opens nor closes an episode: treating it as a
recovery would manufacture one out of missing data.

## Documented boundary behaviour

| Case | Rule |
| --- | --- |
| Deviation exactly at the threshold | Opens an episode (`>=` on the absolute bps). |
| Duplicate timestamps | Collapsed, last value wins, count surfaced in coverage. |
| Out-of-order observations | Sorted by timestamp before anything else. |
| Observation outside the window | Dropped. |
| Deviation crossing through target to the other side with no in-threshold point | Two episodes, not one. |

## Currency conversion

Conversion happens only when a rate for the exact pair exists **at or before**
the observation and within `rateToleranceSeconds`. Nothing is interpolated, no
cross-rate is synthesised through a third currency, and a later rate is never
used to explain an earlier price. A missing rate leaves the point explicitly
unconverted, with the raw price still visible in its own currency.

## Arithmetic

Prices, targets and rates are parsed into `10^18`-scaled bigints, so a target of
0.83 or 1.0000001 is exact and a sub-basis-point deviation does not vanish into
float error. Deviation is truncated toward zero, so a value fractionally past a
threshold is not rounded into an episode it did not reach.

## Modules

`frontend/src/server/research/peg-observations/`: `schema`, `pegDefinitions`,
`observations`, `windows`, `referenceRates`, `deviations`, `episodes`,
`coverage`, `service`.

`frontend/src/components/research/peg-observations/`: `PegWorkspace`,
`AssetReferenceForm`, `DeviationChart`, `EpisodeTable`, `ObservationCoverage`.

## Entry points

- Page: `/insights/peg-observations`
- API: `POST /api/insights/peg-observations`
- Link: "Inspect stable-asset peg deviations" on `PortfolioCard`.

## Data handling

`analysePegObservations` is pure and stateless. The clock is injected through
the request window rather than read from the environment, so a fixture produces
the same report on any machine at any time. No observation history is fetched
and no paid provider is added: the caller supplies the series, and a wallet with
no history gets an honest empty report rather than a synthesised one.

Responses are `no-store`, the route rate-limits to 30/min, and bounds are 12
assets, 2 000 observations per asset, 2 000 rates and 1 MB of body. The session
component is keyed on account and network, so a switch remounts it and a
generation guard discards any response that resolves afterwards.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/peg-observations
npx --prefix frontend playwright test e2e/specs/peg-observations.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-peg-observations.yml`.

## Fixture assumptions

`frontend/tests/features/peg-observations/fixtures.ts` picks prices so every
expected basis-point value is exact: 0.9950 against 1.0000 is −50 bps, 0.8217
against 0.8300 EUR is −100 bps. Fixtures cover usd-and-nonusd-targets,
deviation-recovery-with-gaps, missing-rates-with-an-identity-collision, a
convertible EUR→USD series, duplicates and disorder, a value exactly at the
threshold, and a valid empty request. Nothing touches a network or a paid
provider.

## Out of scope

Alert delivery, background monitoring, price forecasting, portfolio stress
scenarios and changes to stablecoin classification.
