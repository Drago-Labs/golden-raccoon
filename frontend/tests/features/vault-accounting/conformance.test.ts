import { describe, expect, it } from "vitest";
import { assessConformance } from "@/server/research/vault-accounting/conformance";

describe("assessConformance", () => {
  it("reports a fully conforming vault when every read succeeds", () => {
    const result = assessConformance({
      asset: "0xasset",
      totalAssets: 1_000n,
      totalSupply: 1_000n,
      convertToAssetsAvailable: true,
      previewDepositAvailable: true,
      previewRedeemAvailable: true,
    });
    expect(result).toEqual({ conforming: true, missing: [] });
  });

  it("lists each missing core read", () => {
    const result = assessConformance({
      asset: null,
      totalAssets: 1_000n,
      totalSupply: undefined,
      convertToAssetsAvailable: true,
      previewDepositAvailable: true,
      previewRedeemAvailable: true,
    });
    expect(result.conforming).toBe(false);
    expect(result.missing).toEqual(["asset", "totalSupply"]);
  });

  it("lists each missing preview/convert function independently", () => {
    const result = assessConformance({
      asset: "0xasset",
      totalAssets: 1_000n,
      totalSupply: 1_000n,
      convertToAssetsAvailable: false,
      previewDepositAvailable: false,
      previewRedeemAvailable: true,
    });
    expect(result.missing).toEqual(["convertToAssets", "previewDeposit"]);
  });

  it("reports every function missing for a contract that implements none of them", () => {
    const result = assessConformance({
      asset: null,
      totalAssets: null,
      totalSupply: null,
      convertToAssetsAvailable: false,
      previewDepositAvailable: false,
      previewRedeemAvailable: false,
    });
    expect(result.conforming).toBe(false);
    expect(result.missing).toEqual(["asset", "totalAssets", "totalSupply", "convertToAssets", "previewDeposit", "previewRedeem"]);
  });
});
