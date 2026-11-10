import type { CoverageNotice } from "./schema";

export function buildCorrelationCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
