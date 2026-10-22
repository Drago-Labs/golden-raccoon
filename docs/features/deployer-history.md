# Contract deployer history

A read-only profile of the account that deployed a contract: its other nearby deployments, whether any of them reuse the same runtime code (a redeployed template), and where its first on-chain funding came from.

## What it checks

- **Deployer lookup**: binary-searches for the contract's creation block (the first block at which it has code), then looks for a `to: null` transaction in that block whose sender and nonce reproduce the contract's address via the standard `CREATE` formula. This only finds a **direct** EOA deployment — a contract deployed through a factory's internal `CREATE`/`CREATE2` call is reported as "could not be determined," never guessed at.
- **Nearby deployments**: scans a bounded window of blocks around the creation block for other direct creations by the same deployer.
- **Template reuse**: hashes the runtime code of the target and every deployment found nearby, and groups any that share a hash exactly. The target's own hash is always included in this comparison — matching the target itself against a flagged template is the most important check this feature makes.
- **Flagged hashes**: checks every hash (target included) against a small, explicitly sourced list in `flaggedHashes.ts`. A match always names the list it came from.
- **Funding trail**: walks `deployer <- funder <- funder's funder <- ...` for a bounded number of hops, looking for the nearest incoming native-value transfer before each address's relevant block. Stops early on a cycle or an empty hop.

## Scope and limits

- Read-only. No transaction-submission action exists in this feature.
- This feature uses only standard `eth_getCode`/`eth_getBlockByNumber`/`eth_blockNumber` JSON-RPC — no trace or debug namespace, since public RPC endpoints routinely disable those. This is why factory/CREATE2 deployments, and funding beyond the scanned window, cannot always be found.
- Deployment and funding scans are deliberately narrow windows (tens of blocks, not thousands) — fetching full blocks one at a time against a public RPC endpoint does not scale further than that within a request's timeout.
- Does not attribute a deployer to a real-world identity, and does not change any risk score.

## Run the focused suite

```
npm run test -- --run tests/features/deployer-history
```
