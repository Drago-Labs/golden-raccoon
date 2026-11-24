import { describe, expect, it } from "vitest";
import { validateAssetIdentity } from "@/server/research/issuance-ledger/assetIdentity";
import { classifyOperations } from "@/server/research/issuance-ledger/classification";
import { evaluateCheckpoints } from "@/server/research/issuance-ledger/checkpoints";
import { decimalToStroops } from "@/server/research/issuance-ledger/decimalMath";
import { claimReconciled, collectUnreconciled } from "@/server/research/issuance-ledger/reconciliation";
import { applyRunningSupply } from "@/server/research/issuance-ledger/runningSupply";
import { unreconciledFixture } from "./fixtures";

describe("issuance reconciliation", () => {
  it("reports unreconciled differences with surrounding operations", () => {
    const asset = validateAssetIdentity(unreconciledFixture.asset_code, unreconciledFixture.issuer);
    const running = applyRunningSupply(0n, classifyOperations(unreconciledFixture.operations, asset));
    const checkpoints = evaluateCheckpoints(
      running,
      0n,
      unreconciledFixture.checkpoints.map((row) => ({
        ledger: row.ledger,
        networkStroops: decimalToStroops(row.network_supply),
      })),
    );

    expect(checkpoints[0]?.deltaStroops).toBe(2n);
    expect(claimReconciled(checkpoints, false, false)).toBe(false);
    expect(claimReconciled(checkpoints, true, false)).toBe(false);

    const gaps = collectUnreconciled(checkpoints, running);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.deltaStroops).toBe("2");
    expect(gaps[0]?.surrounding.map((op) => op.id)).toEqual(["u1", "u2", "u3"]);
  });
});
