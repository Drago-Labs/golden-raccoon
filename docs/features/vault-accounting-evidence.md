# Vault accounting — sources and limits

## Sources

Every figure in this feature comes from a single `eth_call` to the vault contract (or, for the underlying-balance comparison, to the asset token returned by the vault's own `asset()`), made against the RPC endpoint configured for the selected network in `@/lib/evm/config`. Nothing is read from an indexer, a cache, or a third-party API.

Function selectors are 4-byte values computed from each function's canonical signature (verified against `viem`'s `toFunctionSelector` while this feature was built — see `vaultReader.ts`). A call that reverts or returns no decodable data is treated as "unavailable," not as zero.

## What a result does and does not prove

- **Conformance** proves only that a function call succeeded and returned a decodable value — not that its return value is economically meaningful. A proxy contract that happens to expose these selectors but implements different logic would still appear conforming.
- **The underlying-balance comparison** proves a numeric gap exists between a vault's claimed and directly-held assets. It does **not** prove where the difference went, or that it is a problem — a strategy deployment, a pending harvest, or a rebasing asset can all produce the same gap. Treat it as a prompt to investigate further, not a verdict.
- **Deposit rounding** proves the exact integer behavior of `previewDeposit` → `convertToAssets` for the specific sample amounts supplied. It is not a statement about every possible amount — a vault can round differently at different scales. Supply amounts close to what you actually intend to deposit.
- **The share-price history** samples a bounded number of blocks across a bounded window; it is not a complete history and can miss a jump that happened between two sample points, especially one that reversed before the next sample.

## Limits

- Up to 5 caller-supplied sample amounts per request.
- Up to 5 price-history sample points, spanning at most 50,000 blocks.
- A single RPC request times out after 12 seconds; a timeout is reported as the whole result being `unavailable`, not partially filled in with stale data.
