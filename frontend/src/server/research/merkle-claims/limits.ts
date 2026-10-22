/**
 * Pagination, timeout, and size bounds for the merkle-claims feature.
 * Centralized so the request schema, the RPC client, and the tree loader
 * all agree on the same ceilings.
 */

/** Timeout for a single JSON-RPC request. */
export const RPC_TIMEOUT_MS = 12_000;

/** Timeout for fetching the published tree file. */
export const TREE_FETCH_TIMEOUT_MS = 10_000;

/** Largest tree file this feature will read into memory. Real distribution trees can have thousands of entries, but a single request still has to finish inside the route's own timeout. */
export const MAX_TREE_BYTES = 5_000_000;

/** Largest number of proof siblings this feature will fold before giving up — bounds a maliciously deep or malformed proof array. */
export const MAX_PROOF_LENGTH = 64;

/** Public gateway used to translate an `ipfs://<cid>` reference, or a bare CID, into a fetchable HTTPS URL. */
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
