import { verifyRiskSnapshotRecord } from "@/server/snapshots/integrity";
import { normalizeRiskSnapshotDocument, hashRiskSnapshot } from "@/server/snapshots/canonical";
import { readRiskSnapshot, type IStorageAdapter } from "@/server/snapshots/store";
import type { RiskSnapshotDocument, RiskSnapshotRecord } from "@/server/snapshots/schema";
import { ComparisonValidationError } from "./schema";

export type LoadedSnapshot = {
  document: RiskSnapshotDocument;
  id?: string;
  canonicalHash?: string;
};

/**
 * Derives a deterministic cryptographic hash fingerprint of a snapshot document
 * to assert that comparison processes leave input records completely unmodified.
 *
 * @param document - The risk snapshot document to fingerprint.
 * @returns SHA-256 hash string of the canonicalized snapshot document.
 */
export function getSnapshotFingerprint(document: RiskSnapshotDocument): string {
  return hashRiskSnapshot(document);
}

/**
 * Loads and verifies a snapshot target by identifier, existing database record,
 * or raw document structure. Enforces existing integrity, revocation, expiry,
 * and schema version invariants without writing to storage or altering state.
 *
 * @param target - Object containing either an id, a snapshot record, or a document.
 * @param adapter - Optional storage adapter instance for testing or dependency injection.
 * @returns Loaded and normalized snapshot document with observation metadata.
 */
export async function readSnapshotForComparison(
  target: {
    id?: string;
    record?: unknown;
    document?: unknown;
  },
  adapter?: IStorageAdapter,
): Promise<LoadedSnapshot> {
  if (target.id) {
    const result = await readRiskSnapshot(target.id, adapter);
    if (!result.ok) {
      throw new ComparisonValidationError(
        result.code,
        result.detail,
        { id: target.id },
      );
    }
    return {
      document: result.snapshot.document,
      id: result.snapshot.id,
      canonicalHash: result.snapshot.canonicalHash,
    };
  }

  if (target.record && typeof target.record === "object") {
    const verification = verifyRiskSnapshotRecord(target.record as RiskSnapshotRecord);
    if (!verification.ok) {
      throw new ComparisonValidationError(
        verification.code,
        verification.detail,
        { recordId: (target.record as { id?: string }).id },
      );
    }
    return {
      document: verification.snapshot.document,
      id: verification.snapshot.id,
      canonicalHash: verification.snapshot.canonicalHash,
    };
  }

  if (target.document && typeof target.document === "object") {
    try {
      const normalized = normalizeRiskSnapshotDocument(target.document);
      const hash = hashRiskSnapshot(normalized);
      return {
        document: normalized,
        canonicalHash: hash,
      };
    } catch (cause) {
      throw new ComparisonValidationError(
        "invalid_snapshot",
        cause instanceof Error ? cause.message : "The supplied snapshot document failed validation.",
        cause,
      );
    }
  }

  throw new ComparisonValidationError(
    "invalid_request",
    "Missing snapshot target identifier, record, or document.",
  );
}
