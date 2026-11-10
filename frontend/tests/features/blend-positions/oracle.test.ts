import { describe, expect, it } from "vitest";
import { findMissingOracleAssets } from "@/server/research/blend-positions";

describe("findMissingOracleAssets", () => {
  it("identifies active assets lacking a valid positive oracle price", () => {
    const { priceByAsset, missingAssets } = findMissingOracleAssets(
      ["XLM", "USDC"],
      [
        { assetId: "XLM", priceUsd: 0.5, oracleLedger: 100 },
        { assetId: "USDC", priceUsd: null, oracleLedger: null },
      ],
    );
    expect(priceByAsset.get("XLM")).toBe(0.5);
    expect(missingAssets).toEqual(["USDC"]);
  });
});
