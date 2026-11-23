# Delegate participation — sources and limits

## Sources

| Input | Source | Call |
|---|---|---|
| Voting power over time | The governance token's `DelegateVotesChanged` logs | `eth_getLogs` on the token, topic derived from the event signature |
| Who moved the power | The token's `DelegateChanged` logs | `eth_getLogs` on the token |
| Proposals and their snapshot/close blocks | The governor's `ProposalCreated` logs | `eth_getLogs` on the governor |
| Votes | The governor's `VoteCast` logs | `eth_getLogs` on the governor |
| Whether the governor is a contract at all | `eth_getCode` on the governor | used to separate "unsupported governor" from "no proposals" |
| The chain head | `eth_blockNumber` | bounds the default range |

RPC endpoints come from the repository's existing `@/lib/evm/config` per chain. No indexer, subgraph or governance API is involved, and log data is decoded with viem against the event signatures rather than by hand-slicing hex.

## Hand-checkable fixture

`active-delegates.json` records, over blocks 900–2000:

| Block | Event | Meaning |
|---|---|---|
| 1000 | `DelegateChanged` + `DelegateVotesChanged` (same transaction) | delegator `0x1111…` delegates to A, whose power becomes 1,000 |
| 1100 | `DelegateChanged` + `DelegateVotesChanged` | delegator `0x2222…` delegates to B, whose power becomes 500 |
| 940 | `ProposalCreated` 3 | snapshot 950, closes 990 |
| 1150 | `ProposalCreated` 1 | snapshot 1200, closes 1400 |
| 1500 | `DelegateChanged` + `DelegateVotesChanged` | delegator `0x3333…` delegates to A, whose power becomes 1,500 |
| 1550 | `ProposalCreated` 2 | snapshot 1600, closes 1800 |
| 1300 / 1350 / 1700 | `VoteCast` | A on proposal 1; B on proposals 1 and 2 |

Hand calculation: at proposal 3's snapshot (950) neither delegate held power, so it is eligible for neither. At proposal 1's snapshot (1200) A held 1,000 and B held 500; at proposal 2's snapshot (1600) A held 1,500 and B held 500. A therefore has 2 eligible proposals and voted on 1 → **50.00%**; B has 2 and voted on both → **100.00%**. The largest delegation change is A's +1,000 at block 1000, and the `DelegateChanged` in that same transaction names `0x1111…` as the delegator who moved it.

`dormant-delegate.json` names a delegate with no checkpoint in the range, and includes a proposal still open at the end of it: that delegate's power is `Unknown`, both settled proposals are `undetermined`, the rate is `null`, and the open proposal is excluded from every rate. `unsupported-governor.json` records a governor address with `0x` code. `provider-unavailable.json` records the provider rejecting the log query.

Fixture logs carry a `_note` field alongside the recorded fields so a reviewer can read what each log is without decoding it; the feature reads only the real fields.

## Limits

- **Unknown is not zero.** A delegate with no checkpoint in the scanned range has unknown power unless the range reaches block zero. Proposals that depend on that unknown are reported as undetermined, not as missed votes.
- **A floor, not a total.** If a provider page fills the reader's budget, the report says so and every figure in it is a floor.
- **Scanned range.** `coversHistory` states whether the range reaches block zero. Proposals whose voting window extends past the range are marked as only partly scanned.
- **Votes are counted, not weighted.** Participation is the share of eligible proposals voted on, regardless of the weight cast or the direction of the vote. A vote recorded for a proposal the delegate was not found holding power at the snapshot of is reported in the notes but not counted in the rate.
- **Bounds** (`limits.ts`): 500,000 blocks per request over at most 10 pages of 50,000, 20 named delegates (or the 10 largest discovered), 500 checkpoints per delegate, 200 proposals, 2,000 votes, 25 ranked changes, 32,768 request bytes, 8-second provider timeout.
- **One governor shape.** Only the OpenZeppelin Governor `ProposalCreated`/`VoteCast` and ERC-20 Votes `DelegateChanged`/`DelegateVotesChanged` events are read. Any other governance design is reported as `unsupported_governor` rather than silently mis-measured.
- **No recommendation.** Delegates are listed in the order asked for (or by power when discovered), with no ranking, score or suggestion.
