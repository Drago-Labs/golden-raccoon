# Policy change tracker

## Why this exists

Projects quietly change withdrawal fees, custody terms, or liability
language. Users accept terms once and never see later edits. This feature
answers "did this page change since I last looked?" as an **observation**,
never as a legal opinion.

## The rules that shape the output

**1. A changed paragraph is a recorded difference, not a legal opinion.**

This tool never says a change is good, bad, fair, or deceptive — only that
the text at a URL differs from a prior snapshot, with evidence (fetch time,
HTTP status, redirect chain, content hash). Every report carries
`legalOpinion: null` and `changeIsObservationNotJudgment: true`.

**2. Fetched content is untrusted and is never rendered as HTML.**

The extractor strips tags and scripts and returns plain text only. Nothing
in this feature ever uses `dangerouslySetInnerHTML`; React escapes every
excerpt by default.

**3. A fetch failure is a gap, not a removal.**

If the page cannot be fetched, the existing snapshot history is returned
unchanged — this tool never treats "couldn't reach the page this time" as
"the content is now empty."

## What it inspects

| Input | Evidence |
| --- | --- |
| A registry-listed project's policy page | Bounded HTTPS/HTTP fetch with explicit redirect / size / private-IP / timeout outcomes |
| Extracted text | SHA-256 content hash, paragraph- and sentence-level diff against prior snapshots |
| Numbers and percentages | Highlighted separately when a sentence containing one changed |
| History | Caller-supplied prior snapshots, held in session state — see `policy-changes-evidence.md` |

## Project registry, not a freeform URL box

This tool fetches only a small, fixed list of known Stellar-ecosystem policy
pages (`server/research/policy-changes/projectRegistry.ts`), not an
arbitrary URL a caller supplies. This keeps the fetch surface small and
auditable rather than turning the feature into a general-purpose SSRF-prone
URL fetcher.

## Non-obvious decisions

- **No server-side database.** Like `metadata-integrity`, this feature keeps
  no history store of its own. The caller holds prior snapshots in session
  state and sends them back on each request; "storing" a snapshot means
  returning it to the caller to hold.
- **Historical diffs use the bounded excerpt, not the full original page.**
  Only the newly-fetched snapshot is diffed against full extracted text; any
  older snapshot in the timeline is diffed using the excerpt the caller
  already holds (the server never re-fetches history). This keeps requests
  small at the cost of slightly coarser historical diffs — see
  `policy-changes-evidence.md` for the exact bound.
