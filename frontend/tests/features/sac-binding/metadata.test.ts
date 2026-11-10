import { describe, expect, it } from "vitest";
import { compareSacMetadata, parseClassicAsset } from "@/server/research/sac-binding";
import { USDC_ASSET } from "./fixtures";

describe("compareSacMetadata", () => {
  it("verifies name, symbol, and 7 decimals against the classic asset", () => {
    const asset = parseClassicAsset(USDC_ASSET);
    const matched = compareSacMetadata(asset, {
      name: USDC_ASSET,
      symbol: "USDC",
      decimals: 7,
    });
    expect(matched.allMatch).toBe(true);

    const mismatched = compareSacMetadata(asset, {
      name: "Fake USDC",
      symbol: "USDC",
      decimals: 6,
    });
    expect(mismatched.allMatch).toBe(false);
  });
});
