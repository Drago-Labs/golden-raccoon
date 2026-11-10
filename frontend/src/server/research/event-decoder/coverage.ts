import type { CoverageNotice } from "./schema";

export function buildEventDecoderCoverage(input: CoverageNotice): CoverageNotice {
  return { ...input };
}
