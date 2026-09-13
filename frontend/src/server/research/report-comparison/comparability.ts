/**
 * Decides whether two readable snapshots may be compared at all, and records
 * the caveats that qualify a comparison that is allowed but imperfect.
 */
import type { PublicRiskSnapshot } from "@/server/snapshots/schema";
import { SUPPORTED_SNAPSHOT_VERSIONS, type ComparabilityVerdict, type ObservationMeta } from "./schema";

export function describeObservation(snapshot: PublicRiskSnapshot): ObservationMeta {
  return {
    snapshotId: snapshot.id,
    schemaVersion: snapshot.schemaVersion,
    canonicalHash: snapshot.canonicalHash,
    createdAt: snapshot.createdAt,
    expiresAt: snapshot.expiresAt,
    generatedAt: snapshot.document.freshness.generatedAt,
    staleAt: snapshot.document.freshness.staleAt,
  };
}

export function assessComparability(
  left: PublicRiskSnapshot,
  right: PublicRiskSnapshot,
): ComparabilityVerdict {
  const blockers: Array<{ code: string; detail: string }> = [];
  const caveats: string[] = [];

  for (const [side, snapshot] of [["left", left], ["right", right]] as const) {
    if (!(SUPPORTED_SNAPSHOT_VERSIONS as readonly string[]).includes(snapshot.schemaVersion)) {
      blockers.push({
        code: "unsupported_schema_version",
        detail: `The ${side} snapshot uses schema version ${snapshot.schemaVersion}, which this comparison cannot read.`,
      });
    }
  }

  const leftGenerated = Date.parse(left.document.freshness.generatedAt);
  const rightGenerated = Date.parse(right.document.freshness.generatedAt);

  if (!Number.isFinite(leftGenerated) || !Number.isFinite(rightGenerated)) {
    blockers.push({
      code: "unreadable_observation_time",
      detail: "One of the snapshots does not carry a readable observation time, so the two cannot be ordered.",
    });
  } else if (leftGenerated === rightGenerated) {
    caveats.push(
      "Both snapshots were generated at the same instant. Any difference reflects the report content, not elapsed time.",
    );
  }

  if (left.document.product.version !== right.document.product.version) {
    caveats.push(
      `The snapshots were produced by different product versions (${left.document.product.version} and ${right.document.product.version}). Wording differences may be presentational rather than substantive.`,
    );
  }

  const leftStale = Date.parse(left.document.freshness.staleAt);
  const rightStale = Date.parse(right.document.freshness.staleAt);

  if (Number.isFinite(leftStale) && Number.isFinite(rightStale)) {
    const now = Date.now();
    if (leftStale <= now) caveats.push("The earlier snapshot was already past its staleness horizon when compared.");
    if (rightStale <= now) caveats.push("The later snapshot was already past its staleness horizon when compared.");
  }

  return { comparable: blockers.length === 0, blockers, caveats };
}
