import { array, optional, shape, text } from "./validation.js";
import type { Transport } from "./transport.js";
import type { ReadOptions, WalletQuery } from "./types.js";
export const watchlistSchema = shape({ entries: array(shape({ id: text, walletAddress: text, identityKey: text, chain: text, source: text,
  createdAt: text, network: optional(text), assetKey: optional(text), issuer: optional(text), contractAddress: optional(text), symbol: optional(text) })) });
export type Watchlist = ReturnType<typeof watchlistSchema>;
export const watchlistClient = (get: Transport) => ({ list: (query: Partial<WalletQuery> = {}, options?: ReadOptions) => get("/api/watchlist", query, watchlistSchema, options) });
