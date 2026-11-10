import type { CoverageNotice } from "./schema";

export function buildCallTreeCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
