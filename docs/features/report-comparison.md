# Semantic Comparison of Saved Risk Snapshots

Golden Raccoon report comparison provides deterministic, order-independent semantic reconciliation of immutable risk report snapshots. It enables risk analysts and automated systems to track how an asset's risk posture, individual risk factors, model confidence, and telemetry sources evolve over time without re-running scans or trusting unverified client diffs.

## Architecture

The comparison engine operates as a stateless, pure domain layer on top of verifiable risk snapshot storage:

- **Ephemeral Computation**: Comparisons are computed on demand and return a canonical `report-comparison/2026-01` document. Comparison results are not stored in the database, preserving storage minimization while guaranteeing reproducibility from immutable underlying snapshots.
- **Fail-Closed Verification**: Snapshots loaded from storage are verified against their canonical SHA-256 digest and identity keys before comparison logic executes. Revoked or expired snapshots are rejected.
- **Order-Independent Factor Matching**: Factors are extracted, normalized, and indexed into deterministic semantic keys (`category::slug(label)`). Comparisons match factors by semantic key rather than array position. Reordering reasons in a snapshot produces an identical delta document.
- **Separation of Concerns**:
  - `identityGuard.ts`: Enforces cross-asset and cross-network identity equality.
  - `comparability.ts`: Evaluates schema compatibility and assigns `complete` or `partial` comparability modes.
  - `factorMatching.ts`: Semantic key extraction, factor matching, critical factor delta tracking, and ambiguous entry handling.
  - `scoreDelta.ts`: Score, confidence, verdict, and missing-data boundary shifts.
  - `sourceDelta.ts`: Telemetry source freshness, reliability transitions, and disappearing evidence guards.
  - `service.ts`: Orchestrates pipeline and builds the final comparison document.

## Comparability Rules & Invariants

Comparisons must never compare apples to oranges. The engine enforces the following invariants:

### 1. Identity Guard (Fail-Closed)
- Baseline and target snapshots must share identical `chainFamily`, normalized `network`, and `canonicalIdentity`.
- Any mismatch immediately halts computation and returns `400 Bad Request` with code `CROSS_ASSET_COMPARISON_REJECTED` or `CROSS_NETWORK_COMPARISON_REJECTED`.

### 2. Comparability Mode
- **Complete**: Both snapshots share compatible schema versions (currently `"1"`), are active, and evaluate the same canonical asset.
- **Partial**: Comparison succeeds but logs specific comparability reasons (e.g., minor schema version divergence).

### 3. Unknown-to-Known Boundary Integrity
- Missing data transitions are tracked strictly as telemetry boundary events:
  - `unknownToKnown`: A field missing in baseline is populated in target.
  - `knownToUnknown`: A field present in baseline is missing in target.
- Resolving an unknown field is never conflated with a numeric score reduction.

### 4. Disappearing Source Non-Resolution Invariant
- If a telemetry provider was connected during baseline observation but is unavailable or absent in target observation, the comparison engine flags it as `isDisappearedRiskEvidence: true`.
- An explicit notice is attached: **"Absence of evidence is not evidence of absence. A disappearing source must never be interpreted as a resolved risk factor."**

## API Specification

### Endpoint: `POST /api/insights/report-comparison`

Evaluates and compares two snapshots.

#### Request Body
```json
{
  "baseId": "snap_01j7abc...",
  "targetId": "snap_01j7xyz..."
}
```

Or raw snapshot payloads:
```json
{
  "baseSnapshot": { "schemaVersion": "1", ... },
  "targetSnapshot": { "schemaVersion": "1", ... }
}
```

#### HTTP Status Codes
- `200 OK`: Comparison reconciled successfully. Returns `ReportComparisonDocument`.
- `400 Bad Request`: Mismatched asset identity, mismatched network, or invalid JSON.
- `404 Not Found`: One or both snapshot IDs do not exist in storage.
- `410 Gone`: One or both snapshots have been revoked or expired.
- `422 Unprocessable Entity`: Snapshot fails schema validation.

#### Response Headers
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`

## UI Workbench

The comparison workbench is available at `/insights/report-comparison`:

- **SnapshotSelector**: Input controls for baseline and target snapshot IDs with one-click swap functionality.
- **ScoreDeltaTable**: Side-by-side metric comparison detailing Buy Risk scores (0-100), Model Confidence (0-1), Action Verdict shifts, elapsed observation time, and missing data boundary transitions.
- **FactorChanges**: Filterable factor panel (All, Critical, Changed, Added, Removed, Ambiguous). Changed critical factors feature a dedicated inspection card displaying both baseline and target source observations.
- **SourceChanges**: Telemetry source freshness table with pulsing alert banner whenever evidence sources disappear between observation intervals.

## Verification

Run the report comparison test suite:

```bash
# Run feature unit, route, and component tests
npx vitest run tests/features/report-comparison

# Run specific domain tests
npx vitest run tests/features/report-comparison/comparison.domain.test.ts

# Run route integration tests
npx vitest run tests/features/report-comparison/comparison.route.test.ts

# Run UI component tests
npx vitest run tests/features/report-comparison/comparison.component.test.tsx
```
