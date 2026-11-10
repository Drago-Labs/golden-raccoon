import { describe, expect, it } from "vitest";
import { analyzeHoldingCorrelation } from "@/server/research/holding-correlation";
import { recordedHoldingsProvider, wallet } from "./fixtures";
import correlatedHoldings from "./data/correlated-holdings.json";
import independentHoldings from "./data/independent-holdings.json";
import shortHistory from "./data/short-history.json";

const baseRequest = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  windowDays: 30,
  clusterThreshold: 0.75,
};

describe("analyzeHoldingCorrelation", () => {
  it("computes Pearson and Spearman correlation and clusters co-moving holdings", async () => {
    const result = await analyzeHoldingCorrelation(baseRequest, {
      provider: recordedHoldingsProvider(correlatedHoldings),
    });
    expect(result.state).toBe("complete");
    expect(result.pairs[0]!.pearson).toBeCloseTo(1, 5);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.assets).toEqual(["ETH", "STETH"]);
  });

  it("leaves uncorrelated holdings out of clusters", async () => {
    const result = await analyzeHoldingCorrelation(baseRequest, {
      provider: recordedHoldingsProvider(independentHoldings),
    });
    expect(result.clusters).toEqual([]);
  });

  it("marks short-history holdings as excluded and reports partial state", async () => {
    const result = await analyzeHoldingCorrelation(baseRequest, {
      provider: recordedHoldingsProvider(shortHistory),
    });
    expect(result.state).toBe("partial");
    expect(result.exclusions).toHaveLength(1);
    expect(result.exclusions[0]!.assetId).toBe("NEW");
  });

  it("returns unavailable when the price provider fails", async () => {
    const result = await analyzeHoldingCorrelation(baseRequest, {
      provider: {
        async loadHoldingsWithSeries() {
          throw new Error("Provider unreachable");
        },
      },
    });
    expect(result.state).toBe("unavailable");
    expect(result.coverage.reachedProvider).toBe(false);
  });
});
