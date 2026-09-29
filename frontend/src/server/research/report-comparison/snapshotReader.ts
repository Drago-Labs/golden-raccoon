/**
 * Read-only access to saved snapshots.
 *
 * Every read goes through `readRiskSnapshot`, so the existing integrity,
 * expiry and revocation checks apply unchanged. This module performs no write
 * of any kind: it never creates, revokes, or extends a snapshot, and it never
 * passes a `now` that would make an expired snapshot look live.
 */
import { readRiskSnapshot } from "@/server/snapshots/store";
import type { PublicRiskSnapshot } from "@/server/snapshots/schema";
import type { IStorageAdapter } from "@/server/storage/adapters/types";
import { ComparisonError } from "./schema";

export type ReadPair = { left: PublicRiskSnapshot; right: PublicRiskSnapshot };

/**
 * Maps a snapshot read failure onto a comparison error. The codes are passed
 * through verbatim so the caller can distinguish revoked from expired from
 * tampered without inspecting prose.
 */
function assertReadable(
  result: Awaited<ReturnType<typeof readRiskSnapshot>>,
  side: "left" | "right",
): PublicRiskSnapshot {
  if (result.ok) return result.snapshot;

  throw new ComparisonError(result.code, result.detail, side);
}

export async function readSnapshotPair(
  leftId: string,
  rightId: string,
  adapter?: IStorageAdapter,
): Promise<ReadPair> {
  const [leftResult, rightResult] = await Promise.all([
    readRiskSnapshot(leftId, adapter),
    readRiskSnapshot(rightId, adapter),
  ]);

  return {
    left: assertReadable(leftResult, "left"),
    right: assertReadable(rightResult, "right"),
  };
}

/** Orders a readable pair so `left` is always the earlier observation. */
export function orderByObservation(pair: ReadPair): ReadPair {
  const leftTime = Date.parse(pair.left.document.freshness.generatedAt);
  const rightTime = Date.parse(pair.right.document.freshness.generatedAt);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && rightTime < leftTime) {
    return { left: pair.right, right: pair.left };
  }

  return pair;
}
