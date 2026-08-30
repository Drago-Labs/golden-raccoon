/**
 * Opaque, stable cursor handling.
 * Cursors are base64url-encoded JSON with HMAC-bound wallet/network to prevent cross-boundary paging.
 * Stable under insertion via keyset (id + sortValue) rather than offset.
 */

import { createHmac } from "crypto";

export interface CursorPayload {
  v: 1;
  walletAddress?: string;
  network?: string;
  chainFamily?: string;
  sortBy: string;
  sortDirection: "asc" | "desc";
  lastId: string;
  lastSortValue: string | number;
  filtersHash?: string;
}

const CURSOR_SECRET = process.env.CURSOR_HMAC_SECRET || process.env.NEXTAUTH_SECRET || "golden-raccoon-cursor-secret-v1";

function b64urlEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}
function b64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", CURSOR_SECRET).update(payloadB64).digest("base64url").slice(0, 16);
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  const b64 = b64urlEncode(json);
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function decodeCursor(cursor: string): CursorPayload {
  const parts = cursor.split(".");
  if (parts.length !== 2) throw new Error("Invalid cursor format");
  const [b64, sig] = parts;
  const expected = sign(b64);
  if (sig !== expected) throw new Error("Invalid cursor signature");
  const json = b64urlDecode(b64);
  const payload = JSON.parse(json) as CursorPayload;
  if (payload.v !== 1 || !payload.lastId || !payload.sortBy) throw new Error("Invalid cursor payload");
  return payload;
}

/**
 * Validate cursor boundary: cursor wallet/network must match query wallet/network.
 * Prevents editing cursor to page across different wallet or network.
 */
export function validateCursorBoundary(
  cursorPayload: CursorPayload,
  query: { walletAddress?: string; network?: string; chainFamily?: string },
): void {
  const qWallet = query.walletAddress?.trim().toLowerCase();
  const cWallet = cursorPayload.walletAddress?.trim().toLowerCase();
  // If cursor has wallet, it must match query wallet (if query supplied)
  if (cWallet && qWallet && cWallet !== qWallet) {
    throw new Error("Cursor wallet boundary violation");
  }
  if (cursorPayload.network && query.network && cursorPayload.network.toLowerCase() !== query.network.toLowerCase()) {
    throw new Error("Cursor network boundary violation");
  }
  if (cursorPayload.chainFamily && query.chainFamily && cursorPayload.chainFamily !== query.chainFamily) {
    throw new Error("Cursor chainFamily boundary violation");
  }
}

export function isCursorOpaque(cursor: string): boolean {
  // Opaque = base64url.sig, not plain JSON or offset
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor) && cursor.length > 20;
}
