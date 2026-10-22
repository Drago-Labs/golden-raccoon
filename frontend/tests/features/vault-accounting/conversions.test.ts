import { describe, expect, it } from "vitest";
import { computeSharePrice } from "@/server/research/vault-accounting/conversions";
import { SHARE_PRICE_SCALE } from "@/server/research/vault-accounting/limits";

describe("computeSharePrice", () => {
  it("returns the scale itself for a 1:1 vault", () => {
    const price = computeSharePrice(1_000_000n, 1_000_000n);
    expect(price).toEqual({ assetsPerShareScaled: SHARE_PRICE_SCALE.toString(), scale: SHARE_PRICE_SCALE.toString() });
  });

  it("scales correctly when assets exceed shares", () => {
    const price = computeSharePrice(2_000_000n, 1_000_000n);
    expect(BigInt(price!.assetsPerShareScaled)).toBe(2n * SHARE_PRICE_SCALE);
  });

  it("scales correctly when shares exceed assets", () => {
    const price = computeSharePrice(1_000_000n, 4_000_000n);
    expect(BigInt(price!.assetsPerShareScaled)).toBe(SHARE_PRICE_SCALE / 4n);
  });

  it("returns null when totalAssets is unavailable", () => {
    expect(computeSharePrice(null, 1_000n)).toBeNull();
  });

  it("returns null when totalSupply is unavailable", () => {
    expect(computeSharePrice(1_000n, null)).toBeNull();
  });

  it("returns null for a zero-supply vault rather than dividing by zero", () => {
    expect(computeSharePrice(1_000n, 0n)).toBeNull();
  });
});
