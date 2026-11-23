# Delegate participation

A read-only view of a governance's delegates: how much voting power each held over time, how often they voted on the proposals they could vote on, and which delegations moved power to and from them.

## The participation measure

The governor decides voting power at a proposal's **snapshot block**, so a proposal counts for a delegate only when that delegate held power at that block:

```
eligible proposals = settled proposals where power at the snapshot block > 0
participation       = voted eligible proposals ÷ eligible proposals        (basis points)
```

Three things are deliberately **not** counted as a missed vote:

- **Proposals still open** at the end of the scanned range. A delegate who has not voted yet has not abstained.
- **Proposals whose snapshot is earlier than any checkpoint the range holds** for a delegate who has no checkpoint at all in it. That delegate's power then is unknown, not zero, so the proposal is reported as *undetermined* and excluded from both the numerator and the denominator.
- **Proposals the delegate held no power for.** A delegate cannot miss a vote they could not cast.

When no proposal was eligible, the rate is `null` — never `0%`, which would read as a delegate who never votes.

## Voting power over time

Power is read from the token's own `DelegateVotesChanged` checkpoints. Each event states the power the delegate holds *after* the change, so the series is read from the chain rather than accumulated from deltas, and `previousBalance` means the power just before a checkpoint is known too. The power at any block is the latest checkpoint at or before it.

A delegate with **no** checkpoint in the scanned range has unknown power unless the range reaches block zero, in which case they genuinely held none. That distinction is in the report, not implied.

## Unsupported governors are a typed state

An address that holds no contract code, or whose proposal logs do not decode under the Governor `ProposalCreated` event, produces the typed state `unsupported_governor` with its own reason — never an empty report that reads as "no proposals, no participation". The route answers `422` for it, separate from `503` for a provider that could not be read.

Event topics are derived from the event signatures with viem at load time, so no transcribed hash can drift:

| Event | Read from |
|---|---|
| `DelegateChanged(address,address,address)` | the votes token |
| `DelegateVotesChanged(address,uint256,uint256)` | the votes token |
| `ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)` | the governor |
| `VoteCast(address,uint256,uint8,uint256,string)` | the governor |

## Worked example (the recorded fixture)

`tests/features/delegate-participation/data/active-delegates.json`, scanned over blocks 900–2000:

| Delegate | Power | Eligible | Voted | Participation |
|---|---|---|---|---|
| A | 1,000 → 1,500 (blocks 1000, 1500) | proposals 1 and 2 | proposal 1 | 50.00% |
| B | 500 (block 1100) | proposals 1 and 2 | proposals 1 and 2 | 100.00% |

Proposal 3 closed at block 990 — before either delegate held power — so it counts for neither, which is exactly what makes the measure a participation rate rather than a vote count. `participation.test.ts` and `service.test.ts` assert these figures.

## Not in scope

- **No recommendations.** The report states what each delegate did with the power they held. It does not rank, score, or suggest a delegate.
- **Read-only.** No delegation, vote or any other write exists in this feature.

## Module layout

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod request schema and the exported checkpoint, proposal, delegate and report types. |
| `governanceInput.ts` | Address normalization, chain resolution and block-range resolution. |
| `delegationEvents.ts` | Paged `eth_getLogs` reads and decoding of the token's delegation events. |
| `voteReader.ts` | The governor's proposals and votes, and the unsupported-governor detection. |
| `powerSeries.ts` | Rebuilding each delegate's power series and answering "power at block". |
| `proposalWindows.ts` | Which proposals overlap the range and which had settled by its end. |
| `participation.ts` | The participation measure, and discovering the largest delegates. |
| `delegationChanges.ts` | Ranking the largest power movements with their delegators. |
| `coverage.ts` | Why a delegate is partial, and the report's plain-language notes. |
| `errors.ts` | `DelegateParticipationError` and its typed codes. |
| `limits.ts` | Block, page, delegate, proposal, vote and size bounds. |
| `service.ts` | Composition, typed states, and the production RPC readers. |
| `index.ts` | The only public entry point. |

The page lives at `/insights/delegate-participation`, composed from `src/components/research/delegate-participation/`: `DelegateParticipation.tsx` (workspace root), `GovernanceSelector.tsx`, `DelegateTable.tsx`, `PowerChart.tsx` (chart plus a full text-alternative table), `DelegationChangeList.tsx`, `CoverageNotice.tsx` and `useWorkbenchState.ts`.

## Run the focused suite

```
npx vitest run tests/features/delegate-participation
```
