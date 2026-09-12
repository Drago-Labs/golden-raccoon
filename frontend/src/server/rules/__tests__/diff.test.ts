import { describe, it, expect } from "vitest";
import { calculateRuleDiff } from "../diff";
import { validCurrentV2Rules } from "../__fixtures__/legacy-rules";

describe("Strategy Rule Diff Engine", () => {
  const base = validCurrentV2Rules[0];

  it("reports no changes when comparing identical rules", () => {
    const diff = calculateRuleDiff(base, { ...base });
    expect(diff.hasChanges).toBe(false);
    expect(diff.totalChangedFields).toBe(0);
    expect(diff.scalarChanges).toHaveLength(0);
    expect(diff.arrayChanges).toHaveLength(0);
  });

  it("detects and details scalar limit changes", () => {
    const modified = {
      ...base,
      maxBuyRisk: 25,
      minLiquidityUsd: 50000,
    };
    const diff = calculateRuleDiff(base, modified);

    expect(diff.hasChanges).toBe(true);
    expect(diff.totalChangedFields).toBe(2);

    const riskChange = diff.scalarChanges.find((c) => c.field === "maxBuyRisk");
    expect(riskChange).toBeDefined();
    expect(riskChange?.previous).toBe(40);
    expect(riskChange?.current).toBe(25);
    expect(riskChange?.unit).toBe("%");

    const liqChange = diff.scalarChanges.find((c) => c.field === "minLiquidityUsd");
    expect(liqChange).toBeDefined();
    expect(liqChange?.previous).toBe(25000);
    expect(liqChange?.current).toBe(50000);
    expect(liqChange?.unit).toBe("USD");
  });

  it("detects array additions and removals in allowedChains", () => {
    const modified = {
      ...base,
      allowedChains: ["base", "ethereum"],
    };
    const diff = calculateRuleDiff(base, modified);

    expect(diff.hasChanges).toBe(true);
    const chainChange = diff.arrayChanges.find((c) => c.field === "allowedChains");
    expect(chainChange).toBeDefined();
    expect(chainChange?.added).toEqual(["ethereum"]);
    expect(chainChange?.removed).toEqual(["stellar-testnet"]);
  });

  it("detects array additions and removals in blockedAssets and blockedCategories", () => {
    const modified = {
      ...base,
      blockedAssets: [],
      blockedCategories: ["meme", "low_liquidity"],
    };
    const diff = calculateRuleDiff(base, modified);

    const assetChange = diff.arrayChanges.find((c) => c.field === "blockedAssets");
    expect(assetChange?.removed).toEqual(["evm:base:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]);

    const catChange = diff.arrayChanges.find((c) => c.field === "blockedCategories");
    expect(catChange?.added).toEqual(["low_liquidity"]);
  });

  it("generates a human-readable summary of changed fields", () => {
    const modified = {
      ...base,
      maxBuyRisk: 20,
      allowedChains: ["base"],
    };
    const diff = calculateRuleDiff(base, modified);
    expect(diff.summary).toContain("Max Buy Risk");
    expect(diff.summary).toContain("Allowed Chains");
  });
});
