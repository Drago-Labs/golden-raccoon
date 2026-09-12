# Snapshot comparison

Semantic comparison of two immutable risk snapshots of the same asset on the
same network. It explains what changed between two observations and, just as
importantly, what stopped being observable.

## The distinction the feature exists to make

A risk warning that vanishes between two snapshots has two possible causes: the
risk was resolved, or the source that reported it stopped answering. The
snapshot format cannot tell those apart, so this feature never guesses:

- A source present in the earlier snapshot and absent from the later one, or one
  that went `connected → unavailable`, is flagged `evidenceLost` and described as
  reduced coverage. The UI renders a standing notice for those rows.
- A numeric value that was present and is now absent is `known_to_unknown`, never
  a decrease. The reverse is `unknown_to_known`, never an increase from zero.
- A removed top reason is toned as a caveat, not a success.

## Modules

Feature logic lives in `frontend/src/server/research/report-comparison/`:

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Versioned comparison types, `DeltaDirection`, request validation, limits. |
| `snapshotReader.ts` | Reads both snapshots through `readRiskSnapshot`, mapping integrity failures onto comparison errors; orders the pair by observation time. |
| `identityGuard.ts` | Requires the same canonical asset on the same chain family and network; reports cross-asset and cross-network separately. |
| `factorMatching.ts` | Matches top reasons by normalized content fingerprint and missing-data markers by field; classifies added / removed / changed / unchanged / ambiguous. |
| `scoreDelta.ts` | Numeric and verdict deltas, including the unknown-transition directions. |
| `sourceDelta.ts` | Evidence-source deltas and the `evidenceLost` determination. |
| `comparability.ts` | Blockers (unsupported version, unreadable observation time) and non-blocking caveats. |
| `service.ts` | `compareSnapshots(request, adapter?)` — the only public entry point. |

Presentation lives in `frontend/src/components/research/report-comparison/`:
`ReportComparison`, `SnapshotSelector`, `ScoreDeltaTable`, `FactorChanges`,
`SourceChanges`.

## Matching narrative items

`topReasons` is free prose, so exact-string matching would report a reworded
reason as one removal plus one addition. `fingerprintReason` lowercases, strips
punctuation and digits, drops stop words, de-duplicates and sorts the remaining
words. Reordering the list is a no-op; rewording the sentence is a `changed`
row; a genuinely different reason is `added` or `removed`.

When two reasons on one side reduce to the same fingerprint, the group is
reported as `ambiguous` with all candidates listed, rather than an arbitrary
one-to-one pairing being invented.

Evidence and missing-data arrays are already sorted by
`normalizeRiskSnapshotDocument` at the integrity layer, so array order never
reaches this feature.

## Entry points

- Page: `/insights/report-comparison`
- API: `GET /api/insights/report-comparison?leftId=…&rightId=…`
- Link: "Compare this snapshot with an earlier one" on `RiskSnapshotActions`,
  which pre-fills the active snapshot as the later side.

## Data handling

Every read goes through `readRiskSnapshot`, so the existing expiry, revocation,
tamper and schema-version checks apply unchanged and fail closed. The comparison
path performs **no write**: it never calls `createRiskSnapshot` or
`revokeRiskSnapshot`, never passes a `now` that would revive an expired
snapshot, and never extends a TTL. A domain test asserts this by proxying the
storage adapter and checking which methods were reached.

Responses are `cache-control: no-store`, including error responses. Snapshot ids
are validated against `^snapshot_[A-Za-z0-9-]+$` before reaching storage, and the
route rate-limits to 30 requests per minute per client. No outbound URL is
accepted from the caller, and no server signing is involved.

The page holds ids only for the duration of a request. The session component is
keyed on account and network, so a wallet or network switch remounts it and
discards any comparison on screen; a generation guard drops a response that
resolves after the switch.

## Verification

Focused suite:

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/report-comparison
```

Playwright journey:

```bash
npx --prefix frontend playwright test e2e/specs/report-comparison.spec.ts
```

Repository gate:

```bash
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-report-comparison.yml`.

## Fixture assumptions

`frontend/tests/features/report-comparison/fixtures.ts` builds snapshot records
through the real `hashRiskSnapshot` and `canonicalAssetIdentity` helpers, so a
fixture is readable only if it would also be readable in production. The
tampered fixture mutates its document *after* hashing, which is what the
integrity check exists to catch. Fixtures cover: reordered-equivalent,
added / removed / ambiguous narrative items with a lost source, cross-network,
cross-asset, expired, tampered, revoked, and a valid empty pair. No fixture
touches a network, a wallet, or a paid provider.

## Out of scope

A new snapshot format, share-link lifecycle changes, score explanations, agent
transcript replay, and public wallet exports.
