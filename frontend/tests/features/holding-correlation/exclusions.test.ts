import { describe, expect, it } from "vitest";
import { partitionHoldingsByHistory } from "@/server/research/holding-correlation";
import shortHistory from "./data/short-history.json";

describe("partitionHoldingsByHistory", () => {
  it("excludes holdings with fewer than minOverlapPoints returns", () => {
    const { included, exclusions } = partitionHoldingsByHistory(shortHistory, 5);
    expect(included.map((i) => i.assetId)).toEqual(["ETH"]);
    expect(exclusions).toEqual([
      {
        assetId: "NEW",
        symbol: "NEW",
        reason: "insufficient_history",
        availablePoints: 1,
        requiredPoints: 5,
      },
    ]);
  });
});
