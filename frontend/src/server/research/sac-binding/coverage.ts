import type { CoverageNotice } from "./schema";

export function buildSacCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
