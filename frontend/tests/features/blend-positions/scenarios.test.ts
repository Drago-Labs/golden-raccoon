import { describe, expect, it } from "vitest";
import { explainBlendPositions } from "@/server/research/blend-positions";
import { ACCOUNT_ID, depsFromFixture, POOL_ID } from "./fixtures";
import healthyFixture from "./data/healthy-position.json";

describe("computeLiquidationScenarios", () => {
  it("computes the price drop in collateral and price rise in debt to reach HF = 1.0", async () => {
    const report = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      depsFromFixture(healthyFixture),
    );
    const xlmScenario = report.scenarios.find((s) => s.symbol === "XLM" && s.role === "collateral");
    const usdcScenario = report.scenarios.find((s) => s.symbol === "USDC" && s.role === "liability");
    expect(xlmScenario).toBeDefined();
    expect(xlmScenario!.priceMovePctToLiquidation).toBeLessThan(0);
    expect(usdcScenario).toBeDefined();
    expect(usdcScenario!.priceMovePctToLiquidation).toBeGreaterThan(0);
  });
});
