# Incident status evidence

News lineage finds copied stories. This view asks whether a security incident
was acknowledged, patched, compensated, or still disputed — without treating
status labels as ground truth.

## Rules

### 1. Rumours cannot acknowledge

Only `official_advisory`, `project_statement`, and `remediation_update` with
authority `official` may claim `acknowledged` or `mitigated`. An unverified
rumour that asserts acknowledgement is kept as `reported` with an explicit
reason.

### 2. Identity is chain-aware

Same display names on different networks stay distinct. A document whose subject
does not match the request subject is rejected (`subject_mismatch`), never
merged.

### 3. Copies are not independent advisories

Same canonical URL, declared syndication, or near-duplicate same-outlet text is
marked `syndicated_copy` / `same_outlet_repeat`. Only independent official
sources can make a transition `officiallySupported`.

### 4. Missing follow-up stays explicit

Stale official claims, unknown statuses, and conflicting official sources are
recorded as disagreements. The feature never picks a winner or claims a provider
verified a patch.

## Modules

`frontend/src/server/research/incident-status/`: `schema`, `identity`,
`canonical`, `authority`, `adapter`, `provenance`, `transitions`,
`disagreements`, `coverage`, `service`.

`frontend/src/components/research/incident-status/`: `IncidentStatusPanel`,
`DocumentTable`, `StatusTimeline`, `DisagreementPanel`, `TransitionList`.

## Entry points

- Page: `/insights/incident-status`
- API: `POST /api/insights/incident-status`
- Link: news agent results in `AgentResultPanel`

## Data handling

`analyseIncidentStatus` is pure. It never recomputes a news score, never fetches
a URL, and responses are `no-store`. The route rate-limits to 30/min with a 1 MB
body bound.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/incident-status
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-incident-status.yml`.

## Fixture assumptions

`frontend/tests/features/incident-status/fixtures.ts` isolates rumours that cannot
acknowledge, official status revisions, duplicate articles, conflicting official
sources, stale updates, same-name different-chain rejection, and an empty
report. Nothing touches a network.

## Out of scope

Changing news risk scores, incident response actions, or claiming a provider has
verified a patch.
