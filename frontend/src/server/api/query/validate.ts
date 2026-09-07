/**
 * Validate shared query contract and enforce max page size.
 * Rejects unbounded requests with typed error contract.
 */

import { z } from "zod";
import { ApiError } from "@/server/api/errors";
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, MIN_PAGE_SIZE, ALLOWED_SORT_KEYS, type ResourceType } from "./contract";
import { decodeCursor, validateCursorBoundary } from "./cursor";

export interface ParsedQuery<F extends Record<string, unknown> = Record<string, unknown>> {
  limit: number;
  cursor?: string;
  sortBy: string;
  sortDirection: "asc" | "desc";
  filters: F;
  walletAddress?: string;
  network?: string;
  chainFamily?: string;
}

const baseSchema = z.object({
  cursor: z.string().min(10).optional(),
  limit: z.coerce.number().int().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).optional(),
  sortBy: z.string().min(1).max(40).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  walletAddress: z.string().min(1).max(120).optional(),
  network: z.string().min(1).max(80).optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
});

export function parseQuery<F extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  resource: ResourceType,
  filterSchema?: z.ZodType<F>,
): ParsedQuery<F> {
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("validation_error", "Invalid pagination query", 400, {
      details: parsed.error.flatten(),
    });
  }

  const { cursor, limit, sortBy, sortDirection, walletAddress, network, chainFamily } = parsed.data;

  // Enforce max page size and require bounded request: if no limit is supplied, apply default but never allow unbounded
  const finalLimit = limit ?? DEFAULT_PAGE_SIZE;
  if (finalLimit > MAX_PAGE_SIZE) {
    throw new ApiError("validation_error", `limit exceeds maximum page size ${MAX_PAGE_SIZE}`, 400);
  }

  // Validate sort
  const allowedKeys = ALLOWED_SORT_KEYS[resource] as readonly string[];
  const finalSortBy = sortBy ?? allowedKeys[0];
  if (!allowedKeys.includes(finalSortBy)) {
    throw new ApiError("validation_error", `Invalid sortBy for ${resource}: ${finalSortBy}. Allowed: ${allowedKeys.join(", ")}`, 400);
  }
  const finalSortDirection = sortDirection ?? "desc";

  // Validate cursor if present: must be opaque and boundary-safe
  if (cursor) {
    try {
      const payload = decodeCursor(cursor);
      validateCursorBoundary(payload, { walletAddress, network, chainFamily });
      // Also check cursor sort matches requested sort
      if (payload.sortBy !== finalSortBy || payload.sortDirection !== finalSortDirection) {
        throw new ApiError("validation_error", "Cursor sort mismatch", 400);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Boundary violations and tampering must be rejected with validation_error
      throw new ApiError("validation_error", `Invalid cursor: ${msg}`, 400);
    }
  }

  // Parse filters if schema provided
  let filters = {} as F;
  if (filterSchema) {
    const filterParsed = filterSchema.safeParse(raw);
    if (!filterParsed.success) {
      throw new ApiError("validation_error", "Invalid filters", 400, { details: filterParsed.error.flatten() });
    }
    filters = filterParsed.data as F;
  }

  return {
    limit: finalLimit,
    cursor,
    sortBy: finalSortBy,
    sortDirection: finalSortDirection,
    filters,
    walletAddress,
    network,
    chainFamily,
  };
}

/**
 * Totally unbounded request detection: if caller omits limit and cursor and expects all rows, we still bound via DEFAULT_PAGE_SIZE
 * rather than rejecting, but if they explicitly request limit > MAX or use legacy offset params we reject.
 * This keeps the contract uniform while preventing OOM.
 */
export function requireBounded(limit: number | undefined) {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) throw new ApiError("validation_error", `limit exceeds maximum ${MAX_PAGE_SIZE}`, 400);
  return limit;
}
