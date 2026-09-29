# Evidence coverage explorer

A report can hold connected, stale, missing and contradictory evidence at the
same time. This explorer consolidates it into two questions: which claims have
genuinely independent backing, and which apparent disagreements are provable.

## Two rules

### 1. Corroboration requires independence

Five observations from one source family are one observation repeated, not five
confirmations. Coverage is decided by **independent family count**, never by
observation count.

Families are **declared**, with a stated rationale. Nothing infers that two
sources share an operator from a similar name — guessing would either invent
independence or destroy it. A source nobody declared stands alone, which is the
conservative reading: it neither borrows nor lends corroboration. An unavailable
source contributes no independence at all.

### 2. A contradiction must be provable

Two values conflict only when they are structured numbers, in the same unit,
about the same canonical asset identity, over overlapping windows. Every pair
that fails a check is recorded as *incomparable* with the reason, so a reader
can see the feature looked and declined.

| Rejected because | Reported as |
| --- | --- |
| Different units | `different_unit` — "a unit mismatch, not a disagreement" |
| Non-overlapping windows | `disjoint_windows` — "a change over time, not a contradiction" |
| Free text | `unstructured_value` — free text is never adjudicated |
| Cannot be placed in time | `missing_timestamp` |

The converse holds too: an incomparable pair cannot manufacture **agreement**
either. A claim with two families whose values could not be compared is
`incomparable`, not `corroborated` — they neither agree nor disagree.

`"1.50"` and `"1.5"` are the same number and are not a conflict.

## Freshness

A missing timestamp yields `unknown`, never `fresh`: an observation nobody dated
is unmeasured, not recent. Undated observations get their own timeline bucket
rather than being dropped or placed at the present moment, and source status and
evidence age stay separately inspectable.

## Redaction

The `raw` provider bag is **denied wholesale**, not filtered. No key from a
provider payload is ever forwarded — only the fields this feature explicitly
models cross the boundary — so a provider adding a field tomorrow cannot leak it
through this endpoint. The response reports how many fields were dropped and
names the ones matching a credential or wallet-payload pattern, without carrying
their values.

## Modules

`frontend/src/server/research/evidence-coverage/`: `schema`, `sourceAdapter`,
`claimIndex`, `provenanceGroups`, `freshness`, `conflicts`, `coverage`,
`redaction`, `service`.

`frontend/src/components/research/evidence-coverage/`: `EvidenceExplorer`,
`ClaimCoverageTable`, `SourceFamilyPanel`, `ConflictInspector`,
`FreshnessTimeline`.

## Entry points

- Page: `/insights/evidence-coverage`
- API: `POST /api/insights/evidence-coverage`
- Link: "Explore source coverage and contradictions" on `SourceSnapshotList`.

## Data handling

`exploreEvidence` is pure. It operates on a report the caller already holds, and
it never recomputes a score, never fetches a source URL, and never performs
arbitrary outbound I/O — a test walks every key of the response to assert no
`score`, `buyRisk`, `verdict`, `url`, `href` or `endpoint` field exists.

Responses are `no-store`, the route rate-limits to 30/min, and bounds are 400
claims, 60 observations per claim, 200 sources and 1 MB of body. The session
component is keyed on account and network, so a switch remounts it and a
generation guard discards any response that resolves afterwards.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/evidence-coverage
npx --prefix frontend playwright test e2e/specs/evidence-coverage.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-evidence-coverage.yml`.

## Fixture assumptions

`frontend/tests/features/evidence-coverage/fixtures.ts` isolates one claim per
fixture: duplicate-source-families, comparable-and-incomparable-conflicts
(a genuine conflict plus a unit mismatch, disjoint windows and free text),
stale-missing-secret-fields (including a payload of credential-shaped keys that
must never appear in a response), same-symbol-on-different-chains, an uncovered
claim, a valid empty report, and equivalent number formats. Nothing touches a
network or a provider.

## Out of scope

Provider health probing, distributed tracing, token impersonation resolution,
score attribution and news-specific story clustering.
