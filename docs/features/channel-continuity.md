# Channel continuity inspector

Current social links cannot tell you when an official channel redirected,
changed domain, or began pointing elsewhere. This inspector compares bounded
historical observations of project websites and social handles.

## The line it does not cross

It reports **observed channel changes as evidence**, never as proof of takeover
or fraud.

- A ticker match or shared branding never makes a channel `official`.
- Ambiguous and user-supplied claims stay labelled (`claimKind`).
- Same-symbol tokens stay on distinct identity keys (`chain|symbol|issuer|contract`).
- Lookalike domains never collapse into one another.
- Every continuity event carries a `limitation` stating what the change does
  **not** establish.
- `scoreUnchanged: true` is asserted in tests — no social score is mutated.

## What it tracks

| Event | Meaning |
| --- | --- |
| `redirect` | A supplied redirect chain was observed |
| `domain_change` | Hostname changed between analysable observations |
| `handle_change` / `display_name_change` | Profile identifiers changed |
| `broken_link` | Fetch outcome reported broken |
| `cross_link_change` | Outbound links on the page changed |
| `missing_archive` / `source_failure` | Coverage gaps, not channel conclusions |
| `blocked_unsafe` | Private-network or otherwise unsafe URLs were not fetched |

## URL safety

Observations may carry URLs and redirect chains, but the service **never
fetches** them. `urlSafety.ts` classifies every hop. Private-network targets,
localhost, link-local metadata endpoints and non-http(s) schemes are recorded
as `blocked_unsafe` evidence only.

Rendered URLs are text, not navigable links.

## Modules

`frontend/src/server/research/channel-continuity/`: `schema`, `identityKeys`,
`urlPolicy`, `observationAdapter`, `continuityDiff`, `crossLinks`, `coverage`,
`findings`, `service`.

`frontend/src/components/research/channel-continuity/`:
`ChannelContinuityInspector`, `ContinuityTimeline`, `CrossLinkTable`,
`SourceCoveragePanel`.

## Entry points

- Page: `/insights/channel-continuity`
- API: `POST /api/insights/channel-continuity`
- Link: "Inspect official channel continuity" on `AgentAnalysisClient`.

## Data handling

Stateless: observations are read from the request body, analysed, and discarded
when the handler returns. Nothing reaches storage or cache, and no social API is
called. In the browser they live only in component state, so the session remount
on any wallet or network change clears them.

Responses are `no-store`, the route rate-limits to 20/min, and bounds are 40
subjects, 2 000 observations and 2 MB of body.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/channel-continuity
npx --prefix frontend playwright test e2e/specs/channel-continuity.spec.ts
```

CI runs the focused suite in `.github/workflows/feature-channel-continuity.yml`.

## Fixture assumptions

`frontend/tests/features/channel-continuity/fixtures.ts` covers redirects with
domain and handle churn, same-symbol separate issuers with a lookalike domain,
missing archives and source failures, private-network unsafe redirects, broken
links, hostile markup, and an empty sample. Nothing touches a network.

## Out of scope

Account recovery, reporting users, mutating social scores, or scraping
restricted platforms.
