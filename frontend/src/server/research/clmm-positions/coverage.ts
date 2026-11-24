import type { ClmmReportState } from "./errors";

export function coverageLines(input: {
  state: ClmmReportState;
  positionSource: boolean;
  poolSource: boolean;
  deploymentLabel: string;
}): string[] {
  return [
    input.positionSource
      ? `Position NFTs were read from ${input.deploymentLabel}.`
      : "Position NFT provider was unavailable.",
    input.poolSource
      ? "Pool slot0, fee growth, and tick bitmaps were used for exact tick math."
      : "Pool state was unavailable for one or more positions.",
    "Closed and zero-liquidity positions are listed but excluded from open totals.",
    "This explainer is read-only and never builds collect or rebalance transactions.",
  ];
}

export function coverageNotice(state: ClmmReportState, gaps: string[]): string {
  if (state === "unavailable") {
    return gaps[0] ?? "Concentrated-liquidity position data is currently unavailable.";
  }
  if (state === "partial") {
    return `Partial coverage: ${gaps.join("; ") || "some pool reads failed"}.`;
  }
  return "Complete coverage for the requested address and deployment.";
}
