import { describe, expect, it } from "vitest";
import { explainBlendPositions } from "@/server/research/blend-positions";
import { ACCOUNT_ID, depsFromFixture, OTHER_POOL_ID, POOL_ID } from "./fixtures";
import healthyFixture from "./data/healthy-position.json";
import nearLiquidationFixture from "./data/near-liquidation.json";
import missingOracleFixture from "./data/missing-oracle.json";

describe("explainBlendPositions service", () => {
  it("computes healthy position and near-liquidation position accurately", async () => {
    const healthy = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      depsFromFixture(healthyFixture),
    );
    expect(healthy.state).toBe("complete");
    expect(healthy.health.status).toBe("healthy");

    const nearLiq = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      depsFromFixture(nearLiquidationFixture),
    );
    expect(nearLiq.health.status).toBe("near_liquidation");
  });

  it("marks health factor unavailable when an oracle price is missing", async () => {
    const report = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      depsFromFixture(missingOracleFixture),
    );
    expect(report.state).toBe("partial");
    expect(report.health.available).toBe(false);
    expect(report.health.healthFactor).toBeNull();
  });

  it("refuses to combine positions from a different pool", async () => {
    const mismatched = {
      ...healthyFixture,
      positions: { ...healthyFixture.positions, poolId: OTHER_POOL_ID },
    };
    await expect(
      explainBlendPositions(
        { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
        depsFromFixture(mismatched),
      ),
    ).rejects.toThrow(/never combined/);
  });

  it("returns unavailable when the RPC provider fails", async () => {
    const report = await explainBlendPositions(
      { accountId: ACCOUNT_ID, poolId: POOL_ID, network: "stellar-testnet" },
      {
        poolConfigProvider: {
          async readPoolReserves() {
            throw new Error("RPC timeout");
          },
        },
      },
    );
    expect(report.state).toBe("unavailable");
    expect(report.coverage.reachedProvider).toBe(false);
  });
});
