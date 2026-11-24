import type { ReportState } from "./errors";
import type { ComparisonRow, ExtractedMetadata } from "./schema";

export function coverageNotice(
  state: ReportState,
  metadata: ExtractedMetadata,
  comparisons: ComparisonRow[],
): string {
  if (state === "unavailable") {
    return "Wasm metadata is currently unavailable from the provider. Try again later.";
  }

  if (!metadata.sectionPresent) {
    return "No contractmetav0 section was found. Absence is reported as absent, not as a mismatch.";
  }

  const conflicts = comparisons.filter((row) => row.status === "conflict").length;
  const agreements = comparisons.filter((row) => row.status === "agreement").length;
  const absents = comparisons.filter((row) => row.status === "absent").length;

  if (state === "partial") {
    return `Partial metadata coverage: ${agreements} agreement(s), ${conflicts} conflict(s), ${absents} absent field(s). Metadata proves declared references only when present in Wasm custom sections.`;
  }

  return `Complete metadata read: ${agreements} agreement(s), ${conflicts} conflict(s), ${absents} absent field(s). Custom sections do not prove that the published source builds this Wasm.`;
}
