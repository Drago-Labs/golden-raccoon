# Social pattern workbench

An aggregate social signal cannot tell you whether a spike is a hundred people
reacting or four accounts posting the same sentence twenty-five times. This
workbench measures the difference.

## The line it does not cross

It reports **measured repetition**, never inferred intent.

- It does not call an account a bot. A test walks every key of the response and
  asserts no `bot`, `isBot`, `botScore`, `coordinated`, `inauthentic` or `score`
  field exists.
- It does not deanonymize. Author keys are opaque strings the caller already
  had; nothing resolves one to a person, a follower graph, or any private
  account information.
- It changes no social score or recommendation (`scoreUnchanged: true`).
- Every finding carries a `limitation` field stating what the measurement does
  **not** establish — automation, a shared operator, or intent — rendered in the
  same row as the measurement itself, not in a footnote.

A burst finding says, in its own text, that a burst is also what a genuine news
event looks like. A concentration finding says a prolific account is not
necessarily an inauthentic one.

## Published thresholds

Thresholds are part of the contract and are returned in every response, so a
reader can disagree with the threshold rather than with the verdict:

| Threshold | Value |
| --- | --- |
| `minObservationsForAnalysis` | 12 |
| `minAuthorsForConcentration` | 5 |
| `repeatSimilarity` | 0.9 |
| `burstBucketSeconds` | 300 |
| `burstMultiple` | 4 |
| `minClusterSize` | 3 |
| `concentrationShare` | 0.4 |

Each finding names the threshold it crossed in its `threshold` field.

## Insufficient evidence is a result

Below the published minimums the report returns a **single**
`insufficient_evidence` finding naming both shortfalls, instead of a
low-confidence classification. Its limitation reads: "absence of a finding here
is absence of evidence, not evidence of absence."

## Counting rules

- **One account posting ten times is one participant.** Repeats raise an
  author's message count, never the distinct-author count.
- **Bursts are measured against the median window, not the mean**, so one
  enormous window cannot raise the baseline it is compared against and hide
  itself.
- **Undated observations are never bucketed.** Guessing a time would manufacture
  synchronization the data does not show; they are counted separately and the
  sampling notice says so.
- **Input order cannot change the result.** Observations are sorted by a stable
  key before clustering, and a reversed-input fixture asserts identical output.

## Sampling

A social sample is almost never exhaustive, so the default assumption is that it
is not. `sampleIsExhaustive` must be declared explicitly; otherwise the notice
reads "these counts are a lower bound on what exists. A pattern absent here may
simply be outside the sample."

Observations that cannot be analysed are **kept and listed with a reason**
rather than dropped, so the sample size a reader sees is the one actually
analysed.

## Text handling

`sanitizeText` strips markup and the invisible characters — zero-width, bidi
overrides, C0/C1 controls — that can conceal or reverse displayed text.
`normalizeForComparison` then collapses the variations a copy-paste campaign
introduces: case, punctuation, URLs, mentions, emoji and digit runs, so two
messages differing only by a trailing hashtag normalize to the same string.

## Modules

`frontend/src/server/research/social-coordination/`: `schema`,
`observationAdapter`, `timeBuckets`, `textSimilarity`, `authorGroups`,
`burstDetection`, `coordination`, `sampling`, `service`.

`frontend/src/components/research/social-coordination/`:
`SocialPatternWorkbench`, `ActivityTimeline`, `MessageClusters`,
`ParticipationTable`, `SamplingNotice`.

## Entry points

- Page: `/insights/social-coordination`
- API: `POST /api/insights/social-coordination`
- Link: "Inspect coordinated-activity patterns" on `AgentAnalysisClient`.

## Data handling

Stateless: observations are read from the request body, analysed, and discarded
when the handler returns. Nothing reaches storage or cache, and no social API is
called. In the browser they live only in component state, so the session
remount on any wallet or network change clears them.

Responses are `no-store`, the route rate-limits to 20/min, and bounds are 5 000
observations and 2 MB of body.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/social-coordination
npx --prefix frontend playwright test e2e/specs/social-coordination.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-social-coordination.yml`.

## Fixture assumptions

Every author key in
`frontend/tests/features/social-coordination/fixtures.ts` is an obvious
synthetic placeholder — no real handle, no real person. Fixtures cover
synchronized-copy-burst (40 identical messages from 4 accounts against a quiet
baseline), organic-spike (many accounts in their own words), a sparse sample
below both minimums, duplicates with malformed timestamps and hostile markup, a
reversed-order variant, and an empty sample. Nothing touches a network or a paid
API.

## Out of scope

News clustering, agent prompt changes, account deanonymization, production
social scraping and external moderation actions.
