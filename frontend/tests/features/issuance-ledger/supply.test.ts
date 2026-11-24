import { describe, expect, it } from "vitest";
import { validateAssetIdentity } from "@/server/research/issuance-ledger/assetIdentity";
import { classifyOperations } from "@/server/research/issuance-ledger/classification";
import { evaluateCheckpoints } from "@/server/research/issuance-ledger/checkpoints";
import { decimalToStroops, stroopsToDecimal } from "@/server/research/issuance-ledger/decimalMath";
import { applyRunningSupply, finalSupply } from "@/server/research/issuance-ledger/runningSupply";
import { burnHeavyFixture, reconciledFixture } from "./fixtures";

describe("running supply and checkpoints", () => {
  it("rebuilds supply that matches fixture checkpoints", () => {
    const asset = validateAssetIdentity(reconciledFixture.asset_code, reconciledFixture.issuer);
    const classified = classifyOperations(reconciledFixture.operations, asset);
    const opening = BigInt(reconciledFixture.opening_stroops);
    const running = applyRunningSupply(opening, classified);

    expect(stroopsToDecimal(finalSupply(opening, classified))).toBe("12.0000000");
    expect(running.map((entry) => entry.runningSupplyStroops)).toEqual([
      100_000_000n,
      150_000_000n,
      120_000_000n,
      120_000_000n,
    ]);

    const checkpoints = evaluateCheckpoints(
      running,
      opening,
      reconciledFixture.checkpoints.map((row) => ({
        ledger: row.ledger,
        networkStroops: decimalToStroops(row.network_supply),
      })),
    );
    expect(checkpoints.every((row) => row.reconciled)).toBe(true);
    expect(checkpoints[0]?.reconstructedStroops).toBe(150_000_000n);
    expect(checkpoints[1]?.reconstructedStroops).toBe(120_000_000n);
  });

  it("tracks a burn-heavy path down to the residual supply", () => {
    const asset = validateAssetIdentity(burnHeavyFixture.asset_code, burnHeavyFixture.issuer);
    const running = applyRunningSupply(0n, classifyOperations(burnHeavyFixture.operations, asset));
    expect(running.at(-1)?.runningSupplyStroops).toBe(10_000_000n);
    expect(decimalToStroops("1.0000000")).toBe(10_000_000n);
  });
});
