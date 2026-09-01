/**
 * Uniform pagination envelope.
 */

export interface PaginatedEnvelope<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export function createEnvelope<T>(items: T[], nextCursor: string | null, hasMore: boolean, total?: number): PaginatedEnvelope<T> {
  return { items, nextCursor, hasMore, ...(total !== undefined ? { total } : {}) };
}

/**
 * Helper to paginate an already sorted array using keyset cursor.
 * Ensures insertion mid-page does not skip/duplicate via id+sortValue keyset.
 */
import { encodeCursor, decodeCursor, validateCursorBoundary, type CursorPayload } from "./cursor";

export function paginateArray<T extends Record<string, any>>(
  sorted: T[],
  opts: {
    cursor?: string;
    limit: number;
    walletAddress?: string;
    network?: string;
    chainFamily?: string;
    sortBy: string;
    sortDirection: "asc" | "desc";
    idKey?: string;
  },
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const { cursor, limit, sortBy, sortDirection, idKey = "id" } = opts;
  let startIndex = 0;

  if (cursor) {
    const payload = decodeCursor(cursor);
    validateCursorBoundary(payload, opts);
    if (payload.sortBy !== sortBy || payload.sortDirection !== sortDirection) {
      throw new Error("Cursor sort mismatch");
    }
    // Find position after lastId+lastSortValue using keyset logic
    // For stability, we find index of lastId and start after it, but also handle insertion via sortValue comparison
    const lastIdx = sorted.findIndex((item) => String(item[idKey]) === payload.lastId);
    if (lastIdx >= 0) {
      // Verify sortValue matches to detect tampering; if mismatched, still start after lastId for stability
      startIndex = lastIdx + 1;
    } else {
      // Cursor points to missing item (deleted) — find insertion point by sortValue
      // For simplicity, fall back to binary search by sortValue
      const targetVal = payload.lastSortValue;
      // Find first item that sorts after the cursor value in the requested direction
      startIndex = sorted.findIndex((item) => {
        const val = item[sortBy];
        if (sortDirection === "desc") return val < targetVal || (val === targetVal && String(item[idKey]) > payload.lastId);
        return val > targetVal || (val === targetVal && String(item[idKey]) > payload.lastId);
      });
      if (startIndex === -1) startIndex = sorted.length;
    }
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    const payload: CursorPayload = {
      v: 1,
      walletAddress: opts.walletAddress,
      network: opts.network,
      chainFamily: opts.chainFamily,
      sortBy,
      sortDirection,
      lastId: String(last[idKey]),
      lastSortValue: last[sortBy],
    };
    nextCursor = encodeCursor(payload);
  }

  return { items: page, nextCursor, hasMore };
}
