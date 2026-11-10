import type { CoverageNotice } from "./schema";

export function buildBlendCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
