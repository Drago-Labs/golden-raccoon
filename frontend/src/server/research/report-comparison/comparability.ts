import { RISK_SNAPSHOT_SCHEMA_VERSION, type RiskSnapshotDocument } from "@/server/snapshots/schema";
import type { ComparabilityMode, ComparabilityResult } from "./schema";

/**
 * Assesses whether two risk snapshots can be meaningfully compared, determining
 * whether the pair represents a complete comparison, partial data observation,
 * an empty baseline/target state, or an unsupported schema format.
 *
 * @param base - Baseline risk snapshot document.
 * @param target - Target risk snapshot document.
 * @returns Comparability evaluation result including operational mode and qualitative reasons.
 */
export function checkComparability(
  base: RiskSnapshotDocument,
  target: RiskSnapshotDocument,
): ComparabilityResult {
  const reasons: string[] = [];
  let comparable = true;
  let mode: ComparabilityMode = "complete";

  if (base.schemaVersion !== RISK_SNAPSHOT_SCHEMA_VERSION || target.schemaVersion !== RISK_SNAPSHOT_SCHEMA_VERSION) {
    comparable = false;
    mode = "unavailable";
    reasons.push(
      `Unsupported schema version detected: baseline uses "${base.schemaVersion}", target uses "${target.schemaVersion}". Supported version is "${RISK_SNAPSHOT_SCHEMA_VERSION}".`,
    );
  }

  const baseEmpty = base.topReasons.length === 0 && base.evidence.length === 0;
  const targetEmpty = target.topReasons.length === 0 && target.evidence.length === 0;

  if (baseEmpty && targetEmpty) {
    mode = "empty";
    reasons.push("Both baseline and target snapshots contain empty reason and evidence collections.");
  } else if (baseEmpty || targetEmpty) {
    mode = "partial";
    reasons.push(
      baseEmpty
        ? "Baseline snapshot contains no recorded reasons or evidence."
        : "Target snapshot contains no recorded reasons or evidence.",
    );
  }

  const baseMissingCount = base.missingData.length;
  const targetMissingCount = target.missingData.length;
  const baseUnavailableSources = base.evidence.filter((item) => item.status === "unavailable").length;
  const targetUnavailableSources = target.evidence.filter((item) => item.status === "unavailable").length;

  if (baseMissingCount > 0 || targetMissingCount > 0 || baseUnavailableSources > 0 || targetUnavailableSources > 0) {
    if (mode !== "empty") {
      mode = "partial";
    }
    if (baseMissingCount > 0) {
      reasons.push(`Baseline carries ${baseMissingCount} missing data field markers.`);
    }
    if (targetMissingCount > 0) {
      reasons.push(`Target carries ${targetMissingCount} missing data field markers.`);
    }
    if (baseUnavailableSources > 0) {
      reasons.push(`Baseline contains ${baseUnavailableSources} unavailable evidence sources.`);
    }
    if (targetUnavailableSources > 0) {
      reasons.push(`Target contains ${targetUnavailableSources} unavailable evidence sources.`);
    }
  }

  const baseQuality = baseMissingCount === 0 && baseUnavailableSources === 0 ? "complete" : "partial";
  const targetQuality = targetMissingCount === 0 && targetUnavailableSources === 0 ? "complete" : "partial";

  return {
    comparable,
    mode,
    reasons,
    dataQuality: {
      base: baseEmpty ? "empty" : baseQuality,
      target: targetEmpty ? "empty" : targetQuality,
    },
  };
}
