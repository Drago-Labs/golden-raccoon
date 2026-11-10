import { describe, expect, it } from "vitest";
import { buildCorrelationClusters } from "@/server/research/holding-correlation";

describe("buildCorrelationClusters", () => {
  it("groups holdings whose pairwise Pearson correlation meets the threshold", () => {
    const clusters = buildCorrelationClusters(
      ["ETH", "STETH", "USDC"],
      [
        { assetA: "ETH", assetB: "STETH", sampleSize: 10, insufficientOverlap: false, pearson: 0.98, spearman: 0.97 },
        { assetA: "ETH", assetB: "USDC", sampleSize: 10, insufficientOverlap: false, pearson: 0.05, spearman: 0.04 },
      ],
      0.75,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.assets).toEqual(["ETH", "STETH"]);
  });
});
