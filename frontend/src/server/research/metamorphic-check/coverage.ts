import type { CoverageNotice } from "./schema";

export function buildMetamorphicCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
