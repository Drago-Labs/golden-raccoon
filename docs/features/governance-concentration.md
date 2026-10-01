# DAO voting concentration

Read-only view of OpenZeppelin Governor and Compound Bravo proposals.

- Quorum margin is `for` votes minus the proposal quorum.
- Top-voter share is the heaviest three decisive voters divided by for+against.
- Nakamoto coefficient is the smallest set of decisive voters whose weight exceeds half of for+against.
- Vote events are deduped by transaction hash and log index.
- An unsupported governor variant returns `unsupported`, not an empty success.
- Executed calls are decoded only when the selector is in the supplied ABI. Otherwise the calldata stays raw.
- A truncated page set is labeled partial.
