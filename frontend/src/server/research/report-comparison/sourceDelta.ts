import type { RiskSnapshotDocument } from "@/server/snapshots/schema";
import type {
  SourceDeltaItem,
  SourceDeltaResult,
  SourceDeltaStatus,
} from "./schema";

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Evaluates evidence source differences between baseline and target risk snapshots,
 * verifying source freshness and explicitly highlighting disappeared sources so that
 * missing observations are never interpreted as resolved risks.
 *
 * @param base - Baseline risk snapshot document.
 * @param target - Target risk snapshot document.
 * @returns SourceDeltaResult containing source transitions and statistical totals.
 */
export function calculateSourceDelta(
  base: RiskSnapshotDocument,
  target: RiskSnapshotDocument,
): SourceDeltaResult {
  const baseMap = new Map<string, RiskSnapshotDocument["evidence"][number]>();
  for (const item of base.evidence) {
    baseMap.set(normalizeLabel(item.label), item);
  }

  const targetMap = new Map<string, RiskSnapshotDocument["evidence"][number]>();
  for (const item of target.evidence) {
    targetMap.set(normalizeLabel(item.label), item);
  }

  const allLabels = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()])).sort((a, b) =>
    a.localeCompare(b),
  );

  const items: SourceDeltaItem[] = [];
  let disappearedCount = 0;
  let reconnectedCount = 0;

  for (const labelKey of allLabels) {
    const baseSource = baseMap.get(labelKey);
    const targetSource = targetMap.get(labelKey);

    if (baseSource && !targetSource) {
      const isDisappeared = baseSource.status === "connected";
      if (isDisappeared) {
        disappearedCount += 1;
      }
      items.push({
        label: baseSource.label,
        baseStatus: baseSource.status,
        targetStatus: "missing",
        baseCheckedAt: baseSource.checkedAt,
        status: isDisappeared ? "disappeared" : "removed",
        isDisappearedRiskEvidence: isDisappeared,
        note: isDisappeared
          ? "Source was connected during baseline observation but is missing from target observation. A disappearing source must not be interpreted as a resolved risk."
          : undefined,
      });
      continue;
    }

    if (!baseSource && targetSource) {
      items.push({
        label: targetSource.label,
        baseStatus: "missing",
        targetStatus: targetSource.status,
        targetCheckedAt: targetSource.checkedAt,
        status: "added",
        isDisappearedRiskEvidence: false,
      });
      continue;
    }

    const baseItem = baseSource!;
    const targetItem = targetSource!;

    let freshnessDeltaSeconds: number | undefined;
    if (baseItem.checkedAt && targetItem.checkedAt) {
      const baseMs = new Date(baseItem.checkedAt).getTime();
      const targetMs = new Date(targetItem.checkedAt).getTime();
      if (!Number.isNaN(baseMs) && !Number.isNaN(targetMs)) {
        freshnessDeltaSeconds = Math.round((targetMs - baseMs) / 1000);
      }
    }

    let reliabilityDelta: number | undefined;
    if (typeof baseItem.reliability === "number" && typeof targetItem.reliability === "number") {
      reliabilityDelta = Number((targetItem.reliability - baseItem.reliability).toFixed(4));
    }

    let status: SourceDeltaStatus = "unchanged";
    let isDisappeared = false;

    if (baseItem.status === "connected" && targetItem.status === "unavailable") {
      status = "disappeared";
      isDisappeared = true;
      disappearedCount += 1;
    } else if (baseItem.status === "unavailable" && targetItem.status === "connected") {
      status = "reconnected";
      reconnectedCount += 1;
    } else if (freshnessDeltaSeconds !== undefined) {
      if (freshnessDeltaSeconds > 0) {
        status = "fresh";
      } else if (freshnessDeltaSeconds < 0) {
        status = "stale";
      }
    }

    items.push({
      label: targetItem.label,
      baseStatus: baseItem.status,
      targetStatus: targetItem.status,
      baseCheckedAt: baseItem.checkedAt,
      targetCheckedAt: targetItem.checkedAt,
      freshnessDeltaSeconds,
      reliabilityDelta,
      status,
      isDisappearedRiskEvidence: isDisappeared,
      note: isDisappeared
        ? "Source transitioned from connected to unavailable. Telemetry loss does not indicate a resolved risk factor."
        : undefined,
    });
  }

  const connectedBaseSources = base.evidence.filter((item) => item.status === "connected").length;
  const connectedTargetSources = target.evidence.filter((item) => item.status === "connected").length;

  return {
    summary: {
      totalBaseSources: base.evidence.length,
      totalTargetSources: target.evidence.length,
      connectedBaseSources,
      connectedTargetSources,
      disappearedCount,
      reconnectedCount,
    },
    items,
  };
}
