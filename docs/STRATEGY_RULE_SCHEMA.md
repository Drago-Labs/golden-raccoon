# Strategy Rule Schema Evolution and Migration Architecture

Golden Raccoon strategy rules define transaction limits, asset allowlists, blocked categories, and portfolio constraints. This document details the versioned rule schema, forward migration pipeline, preview simulation, structured diff engine, and error contract.

## Schema Versions

| Property | Version 1 (Legacy) | Version 2 (Current) |
| :--- | :--- | :--- |
| Schema Version Field | Implicit / Optional (`schemaVersion: 1`) | Explicit (`schemaVersion: 2`) |
| Profile Identifier | Optional string (`profileId`) | Explicit preset (`conservative`, `balanced`, `aggressive`, `custom`) |
| Preset Version | Not tracked | Explicit integer (`presetVersion: 1`) |
| Risk Ceiling Field | `maxRiskScore` / `maxBuyRisk` | `maxBuyRisk` (0–100) |
| Daily Volume Field | `maxDailyTransactionValueUsd` | `maxDailyValueUsd` (USD) |
| Trade Value Ceiling | Unspecified (implied) | `maxTradeValueUsd` (USD) |
| Min Liquidity Ceiling | Unspecified (implied) | `minLiquidityUsd` (USD) |
| Max Single Asset Exposure | Unspecified (implied) | `maxSingleTokenExposurePercent` (%) |
| Slippage Ceiling | Optional `maxSlippageBps` | `maxSlippageBps` (basis points, 0–10,000) |
| Asset Blocklist | `blockedTokens` / `blockedAssets` | Normalized canonical keys (`blockedAssets`) |
| Category Blocklist | Generic strings | Typed `BlockableCategory` enum |
| Execution Enforcement | `autoExecute: false` | Strictly `autoExecute: false` (invariant) |

## Field Specifications and Invariants

Every Version 2 rule satisfies these constraints:

- `schemaVersion`: Must equal 2.
- `walletAddress`: Non-empty normalized address string (EVM or Stellar).
- `profileId`: One of `conservative`, `balanced`, `aggressive`, or `custom`.
- `presetVersion`: Integer identifying the preset revision (currently 1).
- `maxBuyRisk`: Finite number between 0 and 100.
- `maxTradePercent`: Finite number between 0 and 100.
- `maxTradeValueUsd`: Finite number >= 0.
- `maxDailyValueUsd`: Finite number >= 0 and >= `maxTradeValueUsd`.
- `minLiquidityUsd`: Finite number >= 0.
- `maxSingleTokenExposurePercent`: Finite number between 0 and 100.
- `minStableReservePercent`: Finite number between 0 and 100.
- `minStableReservePercent + maxTradePercent`: Sum must not exceed 100%.
- `maxMemeExposurePercent`: Finite number between 0 and 100.
- `maxSlippageBps`: Integer between 0 and 10,000 basis points.
- `allowedChains`: Recognized chain list (`base`, `stellar-testnet`, `ethereum`, etc.).
- `blockedAssets`: Array of canonical asset strings (`evm:<chain>:<addr>` or `stellar:<network>:<issuer>:<code|contract>`).
- `blockedCategories`: Array of `BlockableCategory` items (`meme`, `privacy`, `unaudited`, `algorithmic_stable`, `illiquid`).
- `allowedActions`: Array of `AgentRecommendedAction` items.
- `autoExecute`: Strictly literal `false`. Automatic execution without explicit operator authorization is prohibited.

## Forward Migration Chain

The migration pipeline upgrades any legacy rule representation into the current Version 2 schema:

1. **Version Detection**: Inspects `schemaVersion`. If missing, inspects legacy fields (`walletAddress`, `maxRiskScore`, `blockedTokens`) to identify Version 1 records.
2. **Schema Validation**: Parses the raw input against `ruleV1Schema` or `ruleV2Schema`. Unparseable or malformed payloads fail immediately with typed issues.
3. **Field Normalization**:
   - Maps legacy `maxRiskScore` to `maxBuyRisk`.
   - Maps legacy `maxDailyTransactionValueUsd` to `maxDailyValueUsd`.
   - Normalizes chain identifiers (`stellar:pubnet` -> `stellar-pubnet`, `base` -> `base`).
   - Normalizes blocked assets into canonical keys using `parseBlockedAssetList`.
   - Drops invalid or unrecognized blocked asset formats while retaining valid keys.
   - Normalizes blocked categories against `BLOCKABLE_CATEGORIES`.
4. **Business Validation**: Validates the migrated rule against `validateRule`.
5. **Idempotence**: Running `migrateRule` on an already current Version 2 rule is a no-op that returns an identical object.

## Fail-Closed Error Contract

Unparseable or invalid rules are rejected without partial evaluation:

| Failure Type | Error Class | HTTP Status | Error Code |
| :--- | :--- | :--- | :--- |
| Schema / Field Validation Error | `RuleValidationError` | 400 | `validation_error` |
| Migration Syntax / Constraint Failure | `RuleMigrationError` | 400 | `validation_error` |
| Unknown / Unsupported Schema Version | `RuleMigrationError` | 422 | `unsupported_schema_version` |

Error responses return structured JSON:

```json
{
  "code": "validation_error",
  "error": "Rule validation failed",
  "issues": [
    {
      "field": "maxBuyRisk",
      "message": "Max buy risk must not exceed 100"
    }
  ]
}
```

## Candidate Rule Preview Simulation

The preview engine (`previewRule`, `previewRuleEvaluation`) evaluates candidate rules against candidate signals or recent market observations without persisting changes to disk or database.

- Evaluates chain allowlists, blocked assets, blocked categories, liquidity floors, and risk ceilings.
- Produces individual observation breakdowns (`matched` vs `rejected`) with specific rejection reasons.
- Detects rules that match zero signals and reports `zeroMatches: true` with a clear explanation rather than silently saving an over-restrictive policy.

## Structured Diff Engine

The diff engine (`calculateRuleDiff`, `diffRules`) compares a baseline rule with pending edits:

- Tracks scalar field modifications with previous and current values.
- Attaches unit annotations (`%`, `USD`, `bps`) based on field semantics.
- Analyzes array fields (`allowedChains`, `blockedAssets`, `blockedCategories`, `allowedActions`) reporting item additions and removals.
- Produces human-readable summaries for user interface display.

## Verification

Run the test suites and migration verification scripts:

```bash
# Run rules test suite (schema, validation, presets, diff, preview, migration, equivalence)
npm --prefix frontend run test:rules

# Run standalone migration verification harness
npm --prefix frontend run test:rules:migration
```
