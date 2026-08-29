/**
 * Tamper-evident erasure receipt generation and verification.
 *
 * An erasure receipt proves that a wallet erasure completed and records
 * exactly what was removed or anonymized. The receipt:
 *  - never contains the raw wallet address (uses a one-way SHA-256 hash)
 *  - is canonicalized before hashing so key-order changes are detected
 *  - includes the erasure timestamp, tables acted on, and strategy applied
 *  - can be independently verified by recomputing the SHA-256
 *
 * Schema is intentionally minimal and stable — future fields must be
 * added as optional so existing receipts remain verifiable.
 */

import { createHash } from "node:crypto";

export const ERASURE_RECEIPT_VERSION = 1;

// ---------------------------------------------------------------------------
// Canonical serialization (same algorithm as auditBundle.ts)
// ---------------------------------------------------------------------------

/** Stable, deterministic JSON serialization (sorted keys). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One-way hash of the wallet address for receipt scope. */
export function hashWalletForReceipt(walletAddress: string): string {
  return createHash("sha256").update(walletAddress.trim(), "utf8").digest("hex");
}

export interface ErasureTableEntry {
  /** Logical table name. */
  table: string;
  /** "deleted" – row removed; "anonymized" – identity columns NULL-ed; "skipped" – no match found. */
  action: "deleted" | "anonymized" | "skipped";
  /** How many rows were affected. */
  rowsAffected: number;
  /** Strategy declared in the retention policy. */
  strategy: "delete" | "anonymize";
}

export interface ErasureReceiptBody {
  version: typeof ERASURE_RECEIPT_VERSION;
  /** Monotonically increasing receipt id. */
  receiptId: string;
  /** SHA-256 of the wallet address — never the raw identifier. */
  walletHash: string;
  /** Chain family the erasure targeted. */
  chainFamily: "evm" | "stellar";
  /** Optional network qualifier (e.g. "mainnet", "testnet"). */
  network?: string;
  /** ISO 8601 timestamp when the erasure completed. */
  erasedAt: string;
  /** Per-table audit report. */
  tables: ErasureTableEntry[];
  /** Total rows deleted across all tables. */
  totalDeleted: number;
  /** Total rows anonymized across all tables. */
  totalAnonymized: number;
  /** Whether the residue check passed (no wallet identity survives). */
  residueCheckPassed: boolean;
  /** Optional operator note (e.g. partial failure detail). */
  note?: string;
}

export interface ErasureReceipt {
  body: ErasureReceiptBody;
  /** SHA-256 of the canonicalized body. Verifiable without trusting the server. */
  sha256: string;
}

export interface ErasureReceiptVerificationResult {
  valid: boolean;
  issues: string[];
  computedSha256: string;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Build a tamper-evident erasure receipt from an erasure report.
 * The SHA-256 is computed over the canonical (deterministic) serialization.
 */
export function buildErasureReceipt(body: ErasureReceiptBody): ErasureReceipt {
  const sha256 = createHash("sha256").update(canonicalize(body), "utf8").digest("hex");
  return { body, sha256 };
}

/**
 * Convenience factory: construct an ErasureReceiptBody from raw erasure
 * metadata and wrap it in a signed receipt.
 */
export interface BuildErasureReceiptInput {
  walletAddress: string;
  chainFamily: "evm" | "stellar";
  network?: string;
  tables: ErasureTableEntry[];
  residueCheckPassed: boolean;
  note?: string;
}

let receiptCounter = 0;

export function createErasureReceipt(input: BuildErasureReceiptInput): ErasureReceipt {
  receiptCounter += 1;
  const receiptId = `er_${Date.now().toString(36)}_${receiptCounter.toString(36)}`;
  const totalDeleted = input.tables.reduce((sum, t) => (t.action === "deleted" ? sum + t.rowsAffected : sum), 0);
  const totalAnonymized = input.tables.reduce((sum, t) => (t.action === "anonymized" ? sum + t.rowsAffected : sum), 0);

  const body: ErasureReceiptBody = {
    version: ERASURE_RECEIPT_VERSION,
    receiptId,
    walletHash: hashWalletForReceipt(input.walletAddress),
    chainFamily: input.chainFamily,
    ...(input.network ? { network: input.network } : {}),
    erasedAt: new Date().toISOString(),
    tables: input.tables,
    totalDeleted,
    totalAnonymized,
    residueCheckPassed: input.residueCheckPassed,
    ...(input.note ? { note: input.note } : {}),
  };

  return buildErasureReceipt(body);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify that a receipt's SHA-256 matches its canonicalized body.
 * Can be called by the requester without contacting the server.
 */
export function verifyErasureReceipt(receipt: ErasureReceipt): ErasureReceiptVerificationResult {
  const issues: string[] = [];

  if (receipt.body.version !== ERASURE_RECEIPT_VERSION) {
    issues.push(
      `Unsupported receipt version ${String(receipt.body.version)} (expected ${ERASURE_RECEIPT_VERSION}).`,
    );
  }

  const HEX64 = /^[0-9a-f]{64}$/;
  if (!HEX64.test(receipt.body.walletHash)) {
    issues.push("walletHash must be a 64-character lowercase hex string.");
  }
  if (!receipt.body.receiptId || !receipt.body.receiptId.startsWith("er_")) {
    issues.push("receiptId format is invalid.");
  }
  if (!receipt.body.erasedAt || Number.isNaN(Date.parse(receipt.body.erasedAt))) {
    issues.push("erasedAt is not a valid ISO 8601 date.");
  }
  if (!Array.isArray(receipt.body.tables) || receipt.body.tables.length === 0) {
    issues.push("tables array is empty — at least one table entry is expected.");
  }

  const computedSha256 = createHash("sha256")
    .update(canonicalize(receipt.body), "utf8")
    .digest("hex");

  if (receipt.sha256 !== computedSha256) {
    issues.push(
      `SHA-256 mismatch: stored=${receipt.sha256} computed=${computedSha256}. ` +
        "Receipt body has been tampered with or truncated.",
    );
  }

  return { valid: issues.length === 0, issues, computedSha256 };
}
