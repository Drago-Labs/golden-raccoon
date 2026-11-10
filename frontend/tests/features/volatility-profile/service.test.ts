import { describe, expect, it } from "vitest";
import { profileAssetVolatility } from "@/server/research/volatility-profile";
import { recordedPriceSource, wallet } from "./fixtures";
import crash from "./data/crash-and-recovery.json";
import gappy from "./data/gappy-series.json";
import type { RecordedPriceSeries } from "@/server/research/volatility-profile";

const baseRequest = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  assetSymbol: "XLM",
  interval: "1d" as const,
  windowDays: 30,
};

describe("profileAssetVolatility", () => {
  it("profiles volatility and drawdown for a complete price series", async () => {
    const result = await profileAssetVolatility(baseRequest, {
      source: recordedPriceSource(crash as RecordedPriceSeries),
    });
    expect(result.state).toBe("complete");
    expect(result.drawdown.maxDrawdownPct).toBe(50);
  });

  it("reports partial state when gaps are present", async () => {
    const result = await profileAssetVolatility(baseRequest, {
      source: recordedPriceSource(gappy as RecordedPriceSeries),
    });
    expect(result.state).toBe("partial");
    expect(result.gaps).toHaveLength(1);
  });

  it("returns unavailable when the price source throws", async () => {
    const result = await profileAssetVolatility(baseRequest, {
      source: {
        async loadSeries() {
          throw new Error("Feed timeout");
        },
      },
    });
    expect(result.state).toBe("unavailable");
    expect(result.coverage.reachedProvider).toBe(false);
  });
});
