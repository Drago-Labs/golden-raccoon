# Deployer history — sources and limits

## Sources

Every fact in this feature comes from standard JSON-RPC calls (`eth_getCode`, `eth_getBlockByNumber`, `eth_blockNumber`) against the RPC endpoint configured for the selected network in `@/lib/evm/config`. No indexer, explorer API, or cached dataset is used.

The deployer address, when found, is derived mathematically: a `to: null` transaction's sender and nonce are fed into the standard `CREATE` address formula (`keccak256(rlp([sender, nonce]))[12:]`, computed with `viem`'s `getContractAddress`) and compared against the target. A match is proof, not an inference — the address could only have resulted from that exact transaction.

## Flagged code hashes

`flaggedHashes.ts` holds a small, manually curated list of runtime-code hashes. **This is not a live threat-intelligence feed.** Entries are added by this project's maintainers from publicly documented post-mortems of specific malicious contracts, and are expected to go stale — a hash not being on the list is not evidence a contract is safe, only that it doesn't match this specific short list. Every match in the UI states exactly which list entry it came from, by design, so a reader can judge the source for themselves rather than trust an unexplained red flag.

### example-honeypot-template

The one seed entry in the list is a placeholder illustrating the format: a documented "honeypot" token template that blocks transfers from any address other than its deployer. Real entries should follow the same shape: a `codeHash`, a `source` naming exactly where the hash came from, and a `label` describing what the pattern does.

## What a result does and does not prove

- **A found deployer** is proven, as above. A deployer reported as "could not be determined" means the contract was very likely deployed through a factory or `CREATE2` — not that it has no deployer, and not that it is suspicious for that reason alone.
- **Nearby deployments and template reuse** are bounded by a narrow block window (see `limits.ts`). An empty "other deployments" list means none were found *in that window* — it is not a claim that the deployer has never deployed anything else.
- **The funding trail** finds the *nearest* incoming native-value transfer within each hop's window, not necessarily the chain's true first funding event — a window that starts too late, or a funder who received value from several places, can both produce an incomplete picture.
- **A flagged-hash match** means the exact runtime bytecode matches a known pattern. It does not mean the deployer intended harm with *this* deployment, and the absence of a match does not mean the code is safe.

## Limits

- Creation-block search: bounded to `CREATION_SEARCH_MAX_ITERATIONS` binary-search steps.
- Deployment scan: `DEPLOYMENT_SCAN_WINDOW_BLOCKS` blocks on each side of the creation block, capped at `MAX_DEPLOYMENTS` results.
- Funding trail: up to `MAX_FUNDING_HOPS` hops, each scanning `FUNDING_SCAN_WINDOW_BLOCKS` blocks and capped at `MAX_FUNDING_TRANSACTIONS_PER_HOP` transactions.
- A single RPC request times out after 12 seconds.
