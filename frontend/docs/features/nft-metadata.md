# NFT metadata hosting & mutability

A read-only inspector for ERC-721 and ERC-1155 collections: where a sample of
tokens' metadata and media are hosted, whether that hosting is
content-addressed (and so cannot be silently swapped) or sits on a server an
admin can rewrite, and whether the contract itself exposes a way to change
the metadata after the fact.

## What it checks

- **Standard detection**: calls `supportsInterface` (ERC-165) to tell ERC-721
  from ERC-1155. A contract that does not implement ERC-165 at all is
  reported as `"unknown"`, never guessed at from behavior.
- **Sampled token URIs**: reads `tokenURI`/`uri` for a small, bounded set of
  token IDs (1, 2, 3 by default, or caller-supplied), plus `contractURI()`
  when present. An ERC-1155 `{id}` template placeholder is substituted with
  the token's zero-padded hex ID, per the metadata extension spec.
- **Hosting classification**: every URI is classified as `ipfs`, `arweave`,
  `onchain` (a `data:` URI), or `http`. An HTTP(S) gateway path that embeds a
  CID (e.g. `/ipfs/Qm.../...`) is still classified as pinned IPFS — the
  gateway is only a transport, not the content's location of record.
- **Resolution**: every externally fetchable URI is actually fetched (JSON
  parsed, then its `image`/`animation_url` field probed for reachability)
  through this codebase's shared SSRF-safe, DNS-pinned fetcher. A failure is
  reported on the sample, not silently dropped from the results.
- **Mutability signals**: `owner()`, a small set of well-known base-URI
  setter signatures, a small set of well-known freeze-flag view functions,
  and ERC-4906 `MetadataUpdate`/`BatchMetadataUpdate` events in a bounded
  recent block window.

## Scope and limits

- Read-only. No transaction-submission action exists in this feature.
- Base-URI-setter detection only trusts a call that reverted with an
  access-control-flavored reason string — proof the function exists, even
  though this probe's caller was rejected. A setter that exists but merely
  succeeds (or reverts with no reason) looks identical to a missing
  selector on most clients, and is reported as undetected rather than
  guessed at. Newer OpenZeppelin custom-error-based access control is not
  recognized by this text-based heuristic.
- Hosting classification and resolution only cover the sampled token IDs and
  `contractURI()` — they are not a claim about every token in the
  collection.
- Does not mint, trade, value a collection, or change any risk score.

## Run the focused suite

```
npm run test -- --run tests/features/nft-metadata
```
