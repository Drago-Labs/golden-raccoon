# Side-by-side saved run investigation

## Why this exists

Saved agent runs are good evidence and hard to read. Two runs of the same check
rarely agree exactly, and the interesting question is *which part* moved — the
inputs, an agent's observations, the recommendation, or the provider coverage
underneath. Comparing two JSON blobs by eye does not answer that.

## The rule that shapes the output

**It reports what changed, never why.**

A saved record contains what was observed. It does not contain what caused an
observation to differ. So when an agent's score moves *and* its sources went
dark between the runs, those are two facts — reported in two panels, each with
its own timestamps — and the report declines to join them:

> Fewer sources answered in the second run. That is a fact about provider
> coverage; whether it moved this agent's score is not recorded and is not
> claimed here.

`causeNotEstablished: true` rides in the report as data, so a UI cannot render
a correlation as an explanation. The co-occurrence is still surfaced —
`coOccurringCoverageDrop` — because hiding it would be its own kind of
dishonesty. It is labelled as a co-occurrence and nothing more.

## Alignment by identity, not position

Agents are paired **by name**. Two runs frequently store their results in a
different order, and a positional comparison would report every agent as
changed — the most common way a diff view becomes useless.

Findings have no id, so their identity is the label. That works until a run
carries the same label twice, at which point the pairing is genuinely
undetermined:

| Alignment | Meaning |
| --- | --- |
| `matched` | One finding with this label on each side |
| `added` / `removed` | Present on one side only |
| `ambiguous` | The label appears more than once on a side, so which corresponds to which is not determined |

An `ambiguous` pair claims **no change**. A wrong pairing is worse than an
admitted one: it shows a severity or score "change" between two findings that
were never the same finding.

The same principle governs an agent that ran only once: the missing side is
`null`, rendered as an em dash. A zero is a measurement; an absence is not.

## Comparability

Some pairs are technically comparable and almost always misleading. Rather than
refusing them — a user may have a reason — the report labels them, and the
label travels with every number:

| Label | When |
| --- | --- |
| `comparable` | Same subject, same mode |
| `different_subject` | Two different assets: differences are between subjects, not changes over time |
| `different_mode` | Different modes run different agents; not like-for-like |
| `incomparable` | Neither run stored a result |

Runs on **different networks are refused outright** (409 `cross_context`), as
is a run compared against itself.

## Ownership

Both runs are loaded by wallet, and the wallet on each returned record is
checked **again** before a single field reaches the report — so a reader that
ignored the wallet filter cannot leak through. A test drives a deliberately
leaky reader to prove it.

An id the caller does not own returns **`not_found`, never `forbidden`**, with
the same message a nonexistent id produces. The status, code and message are
identical in both cases; only the echoed `runId` — the caller's own input —
differs.

## What it does not do

No agent is run, no provider is contacted, no replay is recorded and no stored
record is written. The `RunReader` port has one method and it is a read; a test
asserts exactly two reads happen per comparison and that the stored records are
byte-identical afterwards.

## States

| Coverage | Meaning |
| --- | --- |
| `complete` | Every agent and every finding aligned |
| `partial` | Some agents in one run only, or some pairings undetermined |
| `unavailable` | The pair is not like-for-like |
| `empty` | Neither run stored a result — a success, not a failure |

## Layout

```
frontend/src/server/research/run-comparison/
  schema.ts         contract; the ambiguous and only-in-one states
  runReader.ts      defensive normalization of a stored record
  ownership.ts      checked before content; re-checked on the record
  comparability.ts  same subject, same mode, or labelled
  alignment.ts      agents paired by name, never by index
  findingDiff.ts    label identity, with ambiguity admitted
  qualityDiff.ts    coverage as its own fact
  inputDiff.ts      snapshots flattened to dotted paths
  service.ts        public entry
frontend/src/components/research/run-comparison/
  RunComparisonWorkspace.tsx  keyed by account and network
  RunPairSelector.tsx         bounded to two by construction
  AgentDifferenceTable.tsx    em dash for an absent side, never a zero
  InputChangesPanel.tsx       shown first: the cause the record supports
  QualityChangesPanel.tsx     its own panel, with timestamps
frontend/tests/features/run-comparison/
```

Entry point: `frontend/src/components/AgentTimeline.tsx`.

## Verification

```
cd frontend
npm run test:run-comparison    # or: npx vitest run tests/features/run-comparison
npx playwright test e2e/specs/run-comparison.spec.ts
```

The focused suite runs on every pull request through
`.github/workflows/feature-run-comparison.yml`. Fixtures are plain
`AgentRunRecord` objects and a reader that filters by wallet the way storage
does; no agent runs, no provider is contacted and no clock is read. No funds,
keys or paid services are involved.
