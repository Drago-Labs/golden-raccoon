import type { ComparisonStatus } from "./errors";
import type { ComparisonRow, ExtractedMetadata } from "./schema";
import type { PublishedReference } from "./sourceReferences";

const FIELD_GETTERS: Record<
  PublishedReference["field"],
  (meta: ExtractedMetadata) => string | null
> = {
  repository: (meta) => meta.repository,
  commit: (meta) => meta.commit,
  sdkVersion: (meta) => meta.sdkVersion,
  rustVersion: (meta) => meta.rustVersion,
  buildTool: (meta) => meta.buildTool,
};

const FIELDS: PublishedReference["field"][] = [
  "repository",
  "commit",
  "sdkVersion",
  "rustVersion",
  "buildTool",
];

function statusFor(wasmValue: string | null, declaredValue: string | null): ComparisonStatus {
  if (wasmValue === null || declaredValue === null) {
    return "absent";
  }
  return normalize(wasmValue) === normalize(declaredValue) ? "agreement" : "conflict";
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Compare Wasm-extracted metadata with published references.
 * Absent metadata is reported as absent, never as a mismatch.
 */
export function compareMetadata(
  metadata: ExtractedMetadata,
  references: PublishedReference[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  for (const field of FIELDS) {
    const refs = references.filter((ref) => ref.field === field);
    const wasmValue = FIELD_GETTERS[field](metadata);

    if (refs.length === 0) {
      rows.push({
        field,
        wasmValue,
        declaredValue: null,
        status: "absent",
        referenceSource: null,
      });
      continue;
    }

    for (const ref of refs) {
      rows.push({
        field,
        wasmValue,
        declaredValue: ref.value,
        status: statusFor(wasmValue, ref.value),
        referenceSource: ref.source,
      });
    }
  }

  return rows;
}
