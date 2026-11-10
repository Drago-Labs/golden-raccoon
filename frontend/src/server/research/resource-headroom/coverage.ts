import type { CoverageNotice } from "./schema";

export function buildHeadroomCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
