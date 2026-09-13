# Risk explanation workbench

An evidence-linked, read-only lens over a risk report that already exists. It
answers "which recorded factors sit behind this number, and what did each one
cite?" without recomputing a score, changing a verdict, or producing a trading
recommendation.

## What it does and does not claim

The current scoring model records a factor's `impact` as a magnitude on a 0-100
scale. It is **not** a share of the agent score, and agent scores are combined by
a weighted aggregation rather than a sum. The workbench therefore never presents
an exact decomposition of `buyRisk`.

Reconciliation is attempted only where the data supports it: if every scored
factor on an agent card carries a `weight` and the weighted mean reproduces that
card's own score within 0.5 points, the agent is labelled **additive** and the
attributed score and remainder are shown. In every other case the agent is
labelled **not additive**, the attributed column reads "Not derivable", and the
panel states in words why.

## Modules

Feature logic lives in `frontend/src/server/research/risk-explanations/`:

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Versioned document types, the read-only projection of `RiskReport` this feature validates, request validation and analysis bounds. |
| `reportAdapter.ts` | Validates the report version and shape, derives canonical asset identity, and exposes a fingerprint used to prove the input was not mutated. |
| `factorIndex.ts` | Assigns each factor a stable key from agent, category, label and a within-agent ordinal, so duplicate labels stay distinct and reordering is a no-op. |
| `contributions.ts` | Splits scored from descriptive factors, reconciles per agent where the model permits it, and reports direction/impact contradictions. |
| `evidenceLinks.ts` | Resolves each factor's `sourceLabel` against the report's sources, preserving `label_only`, `unlinked` and `ambiguous` states. |
| `confidenceGaps.ts` | Collects report-level and agent-level declared gaps without double counting, plus a source-health summary. |
| `explanationTree.ts` | Builds the verdict / blockers / agent / gaps drill-down, referencing contributions by key. |
| `service.ts` | `explainReport(request)` — the only public entry point. Pure, stateless, asserts input immutability. |

Presentation lives in `frontend/src/components/research/risk-explanations/`:
`ExplanationWorkbench` (state, filters, session guards), `ContributionTable`,
`ExplanationTree`, `ConfidencePanel`, `EvidenceDrawer`.

## Entry points

- Page: `/insights/risk-explanations`
- API: `POST /api/insights/risk-explanations`
- Link: the "Explain this score" control on `RiskScoreCard`, rendered only when
  the card is given a `report`.

## Data handling

The endpoint is ephemeral. It persists nothing, caches nothing (`cache-control:
no-store`), makes no outbound request and accepts no URL from the caller. The
report itself is handed from the card to the workbench through a module-scoped
in-memory map keyed by wallet session; the entry is deleted as soon as it is
read, and the whole map is cleared when the active account or network changes.

Every request carries a generation counter and its originating session key. A
response is discarded unless both still match, so a late response cannot restore
data belonging to a previous wallet or network. No server signing or transaction
submission is involved.

## Bounds

`EXPLANATION_LIMITS` caps a request at 24 agent cards, 120 factors per agent, 600
factors in total, 120 sources, 120 missing-data entries and 512 KB of body. The
route rate-limits to 30 requests per minute per client.

## Verification

Focused suite:

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/risk-explanations
```

Playwright journey (no live funds, no paid services):

```bash
npx --prefix frontend playwright test e2e/specs/risk-explanations.spec.ts
```

Repository gate:

```bash
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-risk-explanations.yml`.

## Fixture assumptions

`frontend/tests/features/risk-explanations/fixtures.ts` holds six reports, each
isolating one behaviour: complete-with-an-unlinked-factor, non-additive with
contradictory impact signs and an unlisted source label, the same symbol on two
Stellar networks, a schema-valid empty report, a genuinely additive weighted
report, and a duplicate-label report. They are plain objects — no wallet secret,
no provider response, no network access.

## Out of scope

Scoring or prompt changes, counterfactual recommendations, new provider
ingestion, and snapshot persistence.
