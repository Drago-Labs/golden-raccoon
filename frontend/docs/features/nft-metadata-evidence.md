# NFT metadata — sources and limits

## Sources

On-chain facts come from standard JSON-RPC (`eth_call`, `eth_getLogs`,
`eth_blockNumber`) against the RPC endpoint configured for the selected
network in `@/lib/evm/config`. Off-chain facts (whether a metadata document
or media file actually resolves, and what it contains) come from a live
fetch through this codebase's shared `readPublicHttpsText` fetcher
(`@/server/security/publicHttpsText`): HTTPS-only, DNS-pinned so a redirect
or DNS answer cannot retarget the request into a private network, with a
bounded byte cap, redirect count, and timeout. `ipfs://` and `ar://`
references are translated to a public gateway URL before fetching; a plain
(non-HTTPS) `http://` URI is classified but never fetched.

## What a result does and does not prove

- **Hosting classification** describes the URI returned on-chain *right
  now*. `ipfs://` and a `/ipfs/<cid>` gateway path are pinned by
  construction — the only way to serve different content at that exact URI
  is to also change the URI, which a pinned classification already
  excludes from this feature's "mutable path" bucket. A plain HTTP(S) path
  with no content address can have its response changed by its operator at
  any time without changing the URI at all; a pinned classification is not
  a claim that the *gateway operator itself* is trustworthy or permanent.
- **Resolution** is a point-in-time fetch. A token reported as "resolved"
  resolved when this request ran; it is not a guarantee of future
  availability, especially for a single centralized server or an
  unpinned/ungarbage-collected IPFS object.
- **Fetched metadata is treated as untrusted input.** `safeMetadata.ts`
  extracts only a fixed set of known, primitive, length-capped fields
  (`name`, `description`, `image`, `animation_url`, an attribute *count*)
  from the parsed JSON — never the raw parsed object, never anything
  rendered as markup. A malicious metadata document can at most appear as a
  plain, length-capped string in the UI.
- **Base-URI-setter detection is a text-matched heuristic, not an ABI
  read.** This feature never sees a verified ABI for an arbitrary
  contract. It probes a short, hand-picked list of common setter
  signatures (`setBaseURI(string)`, `setURI(string)`,
  `setTokenURI(uint256,string)`) via a simulated `eth_call`, and only
  claims detection when the call reverted with a reason string matching
  common access-control phrasing (e.g. Ownable's default message). This
  proves the function exists — a nonexistent selector cannot normally
  produce that specific text — but a setter that exists and merely
  succeeds (the common case for a void-return function), or reverts with
  no reason at all, is genuinely indistinguishable from a missing selector
  over `eth_call` alone, and is reported as undetected rather than guessed
  at. Custom-error-based access control (e.g. newer OpenZeppelin
  `OwnableUnauthorizedAccount`) is not recognized by this heuristic, since
  it does not produce a human-readable revert string.
- **Freeze flags** (`metadataFrozen()`, `frozen()`, `isFrozen()`) are read
  directly as view functions — their presence and value are exact, but
  their absence only means none of these three specific names exist, not
  that the contract has no freeze mechanism under a different name.
- **ERC-4906 event counts** are bounded to a recent block window
  (`METADATA_UPDATE_LOG_WINDOW_BLOCKS`); a zero count means none were seen
  *in that window*, not that the collection's metadata has never changed.

## Limits

- A single RPC request or off-chain fetch times out after `RPC_TIMEOUT_MS`
  / `FETCH_TIMEOUT_MS` respectively.
- At most `MAX_SAMPLE_TOKEN_IDS` token IDs are sampled per request.
- A metadata document larger than `MAX_METADATA_BYTES` is reported as a
  failed resolution. A *media* probe that exceeds `MEDIA_PROBE_BYTES` is
  treated as resolved-but-truncated instead — the probe only needs to prove
  the resource exists, and the byte-limit error only ever fires after a
  real, non-redirect response has started streaming.
- The ERC-4906 event scan looks back at most `METADATA_UPDATE_LOG_WINDOW_BLOCKS`
  blocks from the request's block.
