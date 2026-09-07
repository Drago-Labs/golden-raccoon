/**
 * Shared typed query contract for pagination, filtering, and sorting.
 * Issue #143: Apply to every list endpoint.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 1;

export type SortDirection = "asc" | "desc";

export interface PaginationParams {
  /** Opaque cursor (base64url). Absent = first page. */
  cursor?: string;
  /** Number of items to return. Defaults to DEFAULT_PAGE_SIZE. Bounded by MAX_PAGE_SIZE. */
  limit?: number;
}

export interface SortParams {
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface QueryContract<F extends Record<string, unknown> = Record<string, unknown>> extends PaginationParams, SortParams {
  filters?: F;
  walletAddress?: string;
  network?: string;
  chainFamily?: string;
}

/** Declared filter sets per resource */
export type AgentRunsFilters = {
  walletAddress?: string;
  mode?: string;
  status?: string;
};
export type RecommendationsFilters = { walletAddress?: string };
export type TransactionsFilters = { walletAddress?: string; network?: string; chainFamily?: string; status?: string };
export type ApprovalsFilters = { walletAddress?: string };
export type WatchlistFilters = { walletAddress: string; chain?: string; network?: string };
export type AlertsFilters = { walletAddress: string; status?: string; severity?: string };
export type DiscoveryFilters = { walletAddress?: string; chain?: string; provider?: string };

/** Allowed sort keys per resource */
export const ALLOWED_SORT_KEYS = {
  "agent-runs": ["createdAt", "decisionScore"] as const,
  recommendations: ["createdAt"] as const,
  transactions: ["createdAt", "valueUsd"] as const,
  approvals: ["createdAt"] as const,
  watchlist: ["createdAt", "symbol"] as const,
  alerts: ["triggeredAt", "createdAt"] as const,
  discovery: ["createdAt", "score"] as const,
} as const;

export type ResourceType = keyof typeof ALLOWED_SORT_KEYS;
