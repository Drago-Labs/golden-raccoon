# Stable-Asset Peg Deviation Analysis Workspace

## Overview

The Stable-Asset Peg Deviation Analysis Workspace provides deterministic, multi-chain monitoring and statistical analysis of stable assets against their target pegs across EVM and Stellar ecosystems.

This workspace addresses Issue #221 by establishing a dedicated research and analytical facility within Golden Raccoon. It evaluates historical and continuous price observations, detects threshold breach episodes, accounts for sampling gaps without synthetic interpolation, and displays accessible visual trajectories.

---

## Architectural Principles & Invariants

### 1. Cross-Chain Identity Separation
Stable assets sharing the same ticker symbol (such as `USDC` across Ethereum, Base, and Stellar) represent distinct issuing entities, smart contracts, credit risks, and liquidity conditions.
- **EVM Assets**: Uniquely identified by the composite key `(chainFamily: "evm", network, addressOrIssuer, symbol)`.
- **Stellar Assets**: Uniquely identified by `(chainFamily: "stellar", network, addressOrIssuer, symbol)` where `addressOrIssuer` specifies the issuing account (e.g., Centre official issuer `GA5ZSEJY...` versus alternative issuers `GBBD47IF...`).
- Cross-chain observations are never aggregated or blended into a synthetic index unless explicitly paired in an analysis request.

### 2. Explicit Peg Definitions & Non-Unit Targets
Stable assets are not presumed to maintain a 1.00 USD peg.
- **Reference Currency**: The target denomination may be USD, EUR, JPY, SGD, or any supported fiat unit.
- **Declared Target Value**: The peg definition explicitly declares target unit scale. For example, JPYC contracts are modeled against a target of 100.00 JPY per token.
- **Registration Requirement**: Any asset not registered in the canonical registry requires an explicit declared target value and reference currency to be analyzed. Default fallback to 1.00 USD is forbidden.

### 3. Pure FX Normalization (No Synthetic Prices)
When raw observations are recorded in a currency different from the peg target:
- Observations must be converted using explicit reference rates matching the observation timestamp within maximum allowable age bounds.
- If a matching reference rate does not exist, the observation point is marked with `isRateMissing: true` and excluded from deviation statistics.
- The system never interpolates or fabricates synthetic price levels across missing conversion intervals.

### 4. Timestamp Disambiguation & Chronological Hygiene
Observation sequences received from multiple feeds or uploads may arrive out-of-order or contain identical timestamps.
- **Sorting**: All observations are chronologically ordered by Unix millisecond timestamp.
- **Duplicate Disambiguation**: Where duplicate observations share an identical timestamp, the engine calculates the deterministic arithmetic mean of the raw prices and consolidates them into a single point.
- **Future-Drift Guard**: Observations with timestamps drifting further into the future than 300,000 ms (5 minutes) relative to system time are rejected during sanitization.

### 5. Deterministic Deviation Calculation
Basis point deviation from declared peg is computed as:
```text
deviationBps = Math.round(((normalizedPrice - declaredTargetValue) / declaredTargetValue) * 10,000)
```
- A positive value indicates a premium above peg.
- A negative value indicates a discount below peg.

### 6. Episode Tracking & Gap Interruption Invariant
Episodes are tracked as continuous periods where the absolute deviation equals or exceeds the configured threshold in basis points:
- **Active Episodes**: Episodes that remain above threshold at the end of the observed window without return to normal bounds.
- **Recovered Episodes**: Episodes where deviation returned strictly within the threshold before the end of the window.
- **Interrupted Episodes**: If an unobserved gap exceeding `gapToleranceMs` occurs while a deviation is active, the episode is marked with status `interrupted`. The system does not assume recovery occurred during the blind window.

### 7. Explicit Sourcing Limits & Transparency
Analysis output includes documentation of data sourcing parameters:
- Valid point count versus rejected points.
- Duplicate timestamps deduplicated.
- Gaps exceeding tolerance threshold.
- Missing reference rate count.
- Sourcing boundaries disclaimer.

---

## Server Module Structure

The backend engine resides in `frontend/src/server/research/peg-observations/`:

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod schemas and TypeScript types for asset identities, observations, windows, coverage, and analysis results. |
| `pegDefinitions.ts` | Canonical registry for EVM and Stellar assets (USDC, EURC, JPYC, XSGD, USDT, DAI) and custom resolution logic. |
| `observations.ts` | Data sanitization, deduplication, chronological sorting, and future-drift validation. |
| `windows.ts` | Time-window aggregation, interval distribution, sampling density, and gap detection. |
| `referenceRates.ts` | Currency conversion using nearest-preceding or time-bounded reference rates without synthetic pricing. |
| `deviations.ts` | Basis point deviation calculations, min/max/mean/standard deviation distribution metrics. |
| `episodes.ts` | State machine for breach episode lifecycle, recovery duration, and gap interruption classification. |
| `coverage.ts` | Observation quality scoring, coverage status classification, and sourcing limitations notice generation. |
| `service.ts` | Stateless facade combining all sub-systems and loading benchmark verification fixtures. |
| `index.ts` | Public API exports and contracts. |

---

## API Contract

### GET `/api/insights/peg-observations`
Evaluates peg deviation for a canonical asset or benchmark fixture.

#### Query Parameters
- `symbol` (string, required): Asset ticker symbol (e.g. `USDC`).
- `network` (string, required): Target network identifier (e.g. `ethereum`, `base`, `stellar-pubnet`).
- `chainFamily` (string, required): `evm` or `stellar`.
- `addressOrIssuer` (string, required): Contract address or Stellar issuing account.
- `thresholdBps` (number, optional, default: 50): Breach threshold in basis points.
- `gapToleranceMs` (number, optional, default: 3600000): Continuity gap limit in milliseconds.
- `fixture` (string, optional): Name of benchmark test fixture (e.g. `usd-and-nonusd-targets`, `deviation-recovery-with-gaps`, `missing-rates-identity-collision`).

#### Response Headers
- `Cache-Control: no-store, no-cache, must-revalidate`
- `X-Content-Type-Options: nosniff`

---

### POST `/api/insights/peg-observations`
Executes stateless analysis on custom observation payloads, custom peg declarations, or external rate matrices.

#### Request Body
```json
{
  "assetId": {
    "chainFamily": "evm",
    "network": "ethereum",
    "symbol": "CUSTOM_STABLE",
    "addressOrIssuer": "0x1234567890123456789012345678901234567890"
  },
  "customPegDefinition": {
    "name": "Custom Stablecoin",
    "referenceCurrency": "EUR",
    "declaredTargetValue": 1.0,
    "toleranceBps": 25,
    "maxGapIntervalMs": 1800000
  },
  "observations": [
    {
      "timestamp": 1700000000000,
      "price": 0.998,
      "currency": "EUR",
      "source": "verified-feed"
    }
  ],
  "thresholdBps": 25,
  "gapToleranceMs": 1800000
}
```

---

## User Interface & Accessibility (A11y)

The frontend workspace is accessible at `/insights/peg-observations` and linked directly from the Portfolio Dashboard.

### Components
1. **`PegWorkspace.tsx`**: Main interactive client container managing asset selection, threshold adjustment, live analysis fetching, and tabbed inspection.
2. **`AssetReferenceForm.tsx`**: Accessible configuration form with preset asset selectors, custom asset expansion, breach threshold sliders, and fixture selectors.
3. **`DeviationChart.tsx`**: Scalable Vector Graphics (SVG) time series displaying basis point trajectories, threshold bands, gap markers, and an interactive toggle for a full screen-reader-accessible table.
4. **`EpisodeTable.tsx`**: Semantic HTML table with `<caption>`, `<th scope="col">`, status badges, and duration metrics detailing breach episodes.
5. **`ObservationCoverage.tsx`**: Summary card reporting sampling completeness, deduplication metrics, gap counts, and explicit sourcing limitations disclaimers.

---

## Automated Verification

Automated test suites verify all invariants across 4 test layers:
- `tests/features/peg-observations/peg-observations.domain.test.ts` (19 domain invariant tests)
- `tests/features/peg-observations/peg-observations.validation.test.ts` (6 Zod validation tests)
- `tests/features/peg-observations/peg-observations.route.test.ts` (5 API route and rate limit tests)
- `tests/features/peg-observations/peg-observations.component.test.tsx` (4 React accessibility & DOM tests)

Run the test suite with:
```bash
npm run test:peg-observations
```
