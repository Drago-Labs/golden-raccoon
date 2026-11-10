import { describe, expect, it } from "vitest";
import { computeHealthFactor, valuePositionWithFactors } from "@/server/research/blend-positions";

describe("computeHealthFactor", () => {
  it("matches hand-computed effective collateral, liability, and health factor", () => {
    // 1100 XLM @ $0.50 = $550; CF = 75% -> $412.50 effective collateral
    const xlmVal = valuePositionWithFactors({
      supplyTokens: 1100,
      borrowTokens: 0,
      priceUsd: 0.5,
      collateralFactorBps: 7500,
      liabilityFactorBps: 9000,
    });
    expect(xlmVal.effectiveCollateralUsd).toBeCloseTo(412.5, 4);

    // 208 USDC @ $1.00 = $208; LF = 95% -> 208 / 0.95 = $218.947368 effective liability
    const usdcVal = valuePositionWithFactors({
      supplyTokens: 0,
      borrowTokens: 208,
      priceUsd: 1.0,
      collateralFactorBps: 9000,
      liabilityFactorBps: 9500,
    });
    expect(usdcVal.effectiveLiabilityUsd).toBeCloseTo(218.947368, 4);

    const hf = computeHealthFactor(
      [
        {
          poolId: "P",
          assetId: "XLM",
          symbol: "XLM",
          decimals: 7,
          bTokensRaw: "10000000000",
          dTokensRaw: "0",
          bRateRaw: "1100000000",
          dRateRaw: "1050000000",
          underlyingSupplyRaw: "11000000000",
          underlyingBorrowRaw: "0",
          underlyingSupplyFormatted: "1100.0",
          underlyingBorrowFormatted: "0.0",
          collateralFactorBps: 7500,
          liabilityFactorBps: 9000,
          priceUsd: 0.5,
          ...xlmVal,
        },
        {
          poolId: "P",
          assetId: "USDC",
          symbol: "USDC",
          decimals: 7,
          bTokensRaw: "0",
          dTokensRaw: "2000000000",
          bRateRaw: "1020000000",
          dRateRaw: "1040000000",
          underlyingSupplyRaw: "0",
          underlyingBorrowRaw: "2080000000",
          underlyingSupplyFormatted: "0.0",
          underlyingBorrowFormatted: "208.0",
          collateralFactorBps: 9000,
          liabilityFactorBps: 9500,
          priceUsd: 1.0,
          ...usdcVal,
        },
      ],
      [],
    );
    expect(hf.available).toBe(true);
    expect(hf.healthFactor).toBeCloseTo(412.5 / 218.947368, 3);
    expect(hf.status).toBe("healthy");
  });

  it("leaves health factor unavailable when any active asset is missing an oracle price", () => {
    const hf = computeHealthFactor([], ["USDC"]);
    expect(hf.available).toBe(false);
    expect(hf.healthFactor).toBeNull();
    expect(hf.status).toBe("unavailable");
  });
});
