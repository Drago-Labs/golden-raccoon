/** Timeout for a single JSON-RPC request. */
export const RPC_TIMEOUT_MS = 12_000;

/** Upper bound on binary-search iterations when finding the target's creation block (log2 of the widest supported chain height, with margin). */
export const CREATION_SEARCH_MAX_ITERATIONS = 32;

/**
 * Blocks scanned on each side of the target's creation block for other
 * deployments by the same deployer. Deliberately narrow: without an
 * indexer, finding every deployment by an address means fetching full
 * blocks one at a time, which is expensive against a public RPC endpoint.
 */
export const DEPLOYMENT_SCAN_WINDOW_BLOCKS = 20n;

/** Deployments reported per deployer, oldest-found first. */
export const MAX_DEPLOYMENTS = 20;

/** Blocks scanned before a given block when looking for that address's funding transactions. */
export const FUNDING_SCAN_WINDOW_BLOCKS = 30n;

/** How many funding hops to walk back (deployer <- funder <- funder's funder <- ...). */
export const MAX_FUNDING_HOPS = 2;

/** Funding transactions reported per hop. */
export const MAX_FUNDING_TRANSACTIONS_PER_HOP = 3;
