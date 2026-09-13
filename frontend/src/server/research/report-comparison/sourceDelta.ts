/**
 * Evidence-source comparison.
 *
 * A source that stopped reporting is the case this module exists for. Such a
 * change is flagged `evidenceLost` and described as reduced visibility, so no
 * caller can render a vanished warning as a resolved risk.
 */
import type { RiskSnapshotDocument } from "@/server/snapshots/schema";
import { numericDelta } from "./scoreDelta";
import type { ChangeStatus, SourceChange } from "./schema";

type EvidenceEntry = RiskSnapshotDocument["evidence"][number];

function indexByLabel(entries: EvidenceEntry[]): Map<string, EvidenceEntry> {
  const index = new Map<string, EvidenceEntry>();

  for (const entry of entries) {
    // Keep the first occurrence: a snapshot listing the same label twice is
    // already a provenance problem, and picking arbitrarily would hide it.
    if (!index.has(entry.label)) index.set(entry.label, entry);
  }

  return index;
}

export function buildSourceDeltas(
  left: EvidenceEntry[],
  right: EvidenceEntry[],
): SourceChange[] {
  const leftIndex = indexByLabel(left);
  const rightIndex = indexByLabel(right);
  const labels = [...new Set([...leftIndex.keys(), ...rightIndex.keys()])].sort();

  return labels.map((label) => {
    const leftEntry = leftIndex.get(label) ?? null;
    const rightEntry = rightIndex.get(label) ?? null;

    const leftStatus = leftEntry?.status ?? null;
    const rightStatus = rightEntry?.status ?? null;

    let status: ChangeStatus;
    let note: string;
    let evidenceLost = false;

    if (leftEntry === null) {
      status = "added";
      note = "This source appears only in the later observation.";
    } else if (rightEntry === null) {
      status = "removed";
      evidenceLost = true;
      note = "This source is absent from the later observation. Its earlier findings are no longer being confirmed or contradicted; treat this as reduced coverage, not as a cleared risk.";
    } else if (leftStatus === rightStatus) {
      status = "unchanged";
      note = `The source reported ${rightStatus} in both observations.`;
    } else {
      status = "changed";
      evidenceLost = leftStatus === "connected" && rightStatus === "unavailable";
      note = evidenceLost
        ? "This source went from connected to unavailable. Its contribution is missing from the later observation rather than resolved."
        : "This source went from unavailable to connected, so the later observation sees evidence the earlier one could not.";
    }

    const freshnessDelta =
      leftEntry || rightEntry
        ? numericDelta("confidence", leftEntry?.freshnessSeconds ?? null, rightEntry?.freshnessSeconds ?? null, "Freshness (seconds)")
        : null;

    const reliabilityDelta =
      leftEntry || rightEntry
        ? numericDelta("confidence", leftEntry?.reliability ?? null, rightEntry?.reliability ?? null, "Reliability")
        : null;

    return {
      label,
      status,
      leftStatus,
      rightStatus,
      leftCheckedAt: leftEntry?.checkedAt ?? null,
      rightCheckedAt: rightEntry?.checkedAt ?? null,
      freshnessDelta,
      reliabilityDelta,
      evidenceLost,
      note,
    };
  });
}
