import type { CoverageNotice, ScanCoverage } from "./schema";

export function buildCoverage(input: {
  deployerFound: boolean;
  deploymentScan: ScanCoverage | null;
  fundingHopsRequested: number;
  fundingHopsCompleted: number;
}): CoverageNotice {
  return {
    deployerFound: input.deployerFound,
    deploymentScan: input.deploymentScan,
    fundingHopsRequested: input.fundingHopsRequested,
    fundingHopsCompleted: input.fundingHopsCompleted,
  };
}
