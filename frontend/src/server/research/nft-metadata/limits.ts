/**
 * Pagination, timeout, and size bounds for the nft-metadata feature.
 * Centralized so the request schema, the RPC client, and the HTTP
 * fetchers all agree on the same ceilings.
 */

/** Maximum number of caller-supplied token IDs to sample per request. */
export const MAX_SAMPLE_TOKEN_IDS = 5;

/** Token IDs sampled when the caller supplies none. */
export const DEFAULT_SAMPLE_TOKEN_IDS = ["1", "2", "3"];

/** Timeout for a single JSON-RPC request. */
export const RPC_TIMEOUT_MS = 12_000;

/** Timeout for a single off-chain metadata or media fetch. */
export const FETCH_TIMEOUT_MS = 8_000;

/** Largest metadata JSON body this feature will read into memory. */
export const MAX_METADATA_BYTES = 200_000;

/** Bytes read from a media URL to confirm it resolves, without downloading it in full. */
export const MEDIA_PROBE_BYTES = 32_768;

/**
 * Widest block span `eth_getLogs` is asked to scan, looking back from the
 * latest block, for ERC-4906 `MetadataUpdate`/`BatchMetadataUpdate` events.
 */
export const METADATA_UPDATE_LOG_WINDOW_BLOCKS = 50_000n;

/** Public gateway used to translate `ipfs://<cid>` references into a fetchable HTTPS URL. */
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/** Public gateway used to translate `ar://<id>` references into a fetchable HTTPS URL. */
export const ARWEAVE_GATEWAY = "https://arweave.net/";
