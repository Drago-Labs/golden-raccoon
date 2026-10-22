import type { MutabilityResult } from "./mutability";
import type { CoverageNotice, TokenSample } from "./schema";
import type { StandardDetectionResult } from "./standardDetection";

export function buildCoverage(standardDetection: StandardDetectionResult, samples: TokenSample[], mutability: MutabilityResult): CoverageNotice {
  return {
    standardDetected: standardDetection.standard !== "unknown",
    sampledTokens: samples.length,
    resolvedSamples: samples.filter((sample) => sample.resolution.resolved).length,
    metadataUpdateScanTruncated: mutability.metadataUpdateScan.truncated,
  };
}
