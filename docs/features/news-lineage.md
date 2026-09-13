# Story lineage

One wire story republished across ten domains looks like ten confirmations.
This feature separates independent reporting from copies of it, and records the
reason behind every grouping decision.

It adds structure over evidence the news agent already produced. It changes no
score (`scoreUnchanged: true` is carried in the payload and asserted in tests)
and offers no confirmation guarantee.

## Ranked clustering reasons

A cluster records the **strongest** reason any member matched by, so a reader
can always tell documented syndication from a text-similarity guess:

| Reason | Strength | Meaning |
| --- | --- | --- |
| `same_canonical_url` | 5 | One article reached two ways |
| `declared_syndication` | 4 | The article attributes the story to another outlet |
| `exact_text_match` | 3 | Identical text after normalization |
| `near_duplicate_text` | 2 | Body overlap at or above 0.82 |
| `insufficient_text` | 1 | Too sparse to compare — no clustering attempted |
| `distinct_reporting` | 0 | Below the threshold — kept apart |

Declared syndication is believed even when the wording differs, because a
rewrite of a wire story is still not independent reporting. Conversely, a
**similar headline alone never collapses two reports**: `near_duplicate_text`
measures body overlap, and the fixtures include two articles with identical
headlines and different bodies that stay in separate lineages.

## Conservative corroboration

Role assignment runs in a fixed precedence, and every branch can only *lower*
the weight an article carries:

1. Too little text → `unknown_provenance`.
2. Attributes the story elsewhere → `syndicated_copy` (even if it is the
   earliest article present).
3. Earliest member attributing to no one → `independent` (the lineage origin).
4. Outlet already counted in this lineage → `same_outlet_repeat`.
5. Matched to an earlier member by URL or text → `syndicated_copy`.
6. Otherwise → `independent`.

`independentReportCount` counts **distinct outlets with an `independent`
member**. A lineage of four articles from one origin reports
`independentReportCount: 1` and the note "a single report, not 3 confirmations".

Unknown provenance is never assumed independent; a lineage dominated by it is
`indeterminate` rather than corroborated or refuted. A single outlet is
described as "an absence of corroboration", explicitly not as evidence against.

## Chronology that preserves uncertainty

- **Event time and publication time are separate facts.** An article that does
  not distinguish them is placed by publication time and *labelled as such*.
- An article with neither is `kind: "unknown"` with `at: null` — placed nowhere
  rather than dated to the present.
- A publication timestamp later than the observation is flagged as "a data
  problem, not a scheduled future report".
- An undeclared language is recorded as uncertainty, because a translated
  headline may not order as it appears to.
- A **correction is recognised only when declared**. Nothing infers that a later
  article corrects an earlier one from wording.

## Text handling

`sanitizeText` strips markup and the invisible characters — zero-width,
bidirectional overrides, C0/C1 controls — that can hide or reverse displayed
text. Titles are attacker-influenced input.

`tokenize` keeps Unicode letters and numbers, so a Turkish or Japanese headline
tokenizes properly instead of looking "sparse" because the tokenizer only
understood ASCII.

URLs are canonicalized as **strings** and never fetched. Tracking parameters,
fragments, `www.` and trailing slashes are stripped; non-`http(s)` schemes
resolve to `null` so a `javascript:` URL is never echoed back as an article.
Rendered URLs are text, not links.

## Modules

`frontend/src/server/research/news-lineage/`: `schema`, `articleAdapter`,
`canonicalLinks`, `fingerprints`, `syndication`, `claims`, `corroboration`,
`chronology`, `service`.

`frontend/src/components/research/news-lineage/`: `NewsLineagePanel`,
`StoryClusters`, `ClaimTimeline`, `CorroborationTable`, `ArticleEvidence`.

## Entry points

- Page: `/insights/news-lineage`
- API: `POST /api/insights/news-lineage`
- Link: "Inspect story lineage and independent corroboration" on
  `AgentResultPanel`, rendered for news results.

## Verification

```bash
npm ci --prefix frontend
npx --prefix frontend vitest run tests/features/news-lineage
npx --prefix frontend playwright test e2e/specs/news-lineage.spec.ts
npm run quality:gate
```

CI runs the focused suite in `.github/workflows/feature-news-lineage.yml`.

## Fixture assumptions

`frontend/tests/features/news-lineage/fixtures.ts` covers
syndicated-and-independent-reports, similar-titles-with-distinct-bodies, the
same canonical URL reached two ways, corrections-with-missing-event-time (plus a
future timestamp and an undated article), multilingual-sparse-adversarial text
(non-Latin script, a headline-only article, and markup with bidi overrides), a
same-outlet repeat, and empty evidence. Nothing touches a network.

## Out of scope

A new news provider, generic evidence dashboards, LLM prompt or scoring changes,
and arbitrary article scraping.
