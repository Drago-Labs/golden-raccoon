/**
 * Pagination, timeout, and size bounds for the vault-accounting feature.
 * Centralized so the request schema, the RPC client, and the price
 * sampler all agree on the same ceilings.
 */

/** Maximum number of caller-supplied sample amounts for the rounding table. */
export const MAX_SAMPLE_AMOUNTS = 5;

/** Number of points sampled across the share-price window, including the end block. */
export const PRICE_SAMPLE_POINTS = 5;

/** Widest block span the price sampler will look back over. */
export const PRICE_SAMPLE_WINDOW_BLOCKS = 50_000n;

/** A consecutive-sample move at or above this many basis points is flagged as a sudden jump. */
export const PRICE_JUMP_THRESHOLD_BPS = 500;

/** Timeout for a single JSON-RPC request. */
export const RPC_TIMEOUT_MS = 12_000;

/** Fixed-point scale used to express the assets-per-share ratio as an integer. */
export const SHARE_PRICE_SCALE = 10n ** 18n;
