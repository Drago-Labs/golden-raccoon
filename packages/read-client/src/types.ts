export interface ReadOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}
export interface ClientOptions extends ReadOptions {
  /** Origin or deployment prefix, without /api, a query, fragment, or userinfo. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Additional attempts after the first, from zero to three. Default: one. */
  retries?: number;
  /** Maximum delay we are willing to wait; longer Retry-After fails without retrying early. */
  maxRetryDelayMs?: number;
}
export type Query = Record<string, string | number | undefined>;
export type WalletQuery = { walletAddress: string };
export type StellarNetwork = "stellar-testnet" | "stellar-mainnet";
