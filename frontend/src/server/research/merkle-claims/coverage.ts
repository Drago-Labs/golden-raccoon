import type { CoverageNotice } from "./schema";

export function buildCoverage(input: {
  onChainRootRead: boolean;
  treeLoaded: boolean;
  proofChecked: boolean;
  claimStatusRead: boolean;
}): CoverageNotice {
  return { ...input };
}
