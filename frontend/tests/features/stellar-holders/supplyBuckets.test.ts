import { describe, expect, it } from "vitest";
import { buildSupplyBuckets } from "@/server/research/stellar-holders/supplyBuckets";
import { poolHeavy } from "./fixtures";

describe("supply buckets", () => {
  it("keeps trustlines, pools, and claimables as separate shares of issued supply", () => {
    const supply = buildSupplyBuckets({
      holderBalances: ["10.0000000"],
      pools: [{ id: "pool-a", amount: "20.0000000" }],
      claimables: [{ id: "claim-a", amount: "70.0000000" }],
      issued: "100.0000000",
      contracts: "0.0000000",
    });

    expect(supply.buckets.map((bucket) => [bucket.id, bucket.shareOfIssued])).toEqual([
      ["trustlines", { numerator: "1", denominator: "10" }],
      ["liquidity_pools", { numerator: "1", denominator: "5" }],
      ["claimable_balances", { numerator: "7", denominator: "10" }],
    ]);
    expect(supply.observedBaseUnits).toBe(100n * 10_000_000n);
    expect(supply.pools.map((pool) => pool.id)).toEqual(["pool-a"]);
    expect(supply.claimables[0]?.baseUnits).toBe((70n * 10_000_000n).toString());
  });

  it("sums every pool in the pool-heavy fixture instead of copying one reserve", () => {
    const supply = buildSupplyBuckets({
      holderBalances: poolHeavy.pages[0].records.map((record) => record.balance),
      pools: poolHeavy.pools,
      claimables: poolHeavy.claimables,
      issued: poolHeavy.supply!.issued,
      contracts: poolHeavy.supply!.contracts,
    });

    expect(supply.trustlineBaseUnits).toBe(20n * 10_000_000n);
    expect(supply.pools).toHaveLength(2);
    expect(supply.buckets.find((bucket) => bucket.id === "liquidity_pools")).toMatchObject({
      amount: "80.0000000",
      shareOfIssued: { numerator: "4", denominator: "5" },
    });
    expect(supply.buckets.find((bucket) => bucket.id === "trustlines")?.shareOfIssued).toEqual({ numerator: "1", denominator: "5" });
    expect(supply.buckets.find((bucket) => bucket.id === "claimable_balances")?.shareOfIssued).toEqual({ numerator: "0", denominator: "1" });
    expect(supply.observedBaseUnits).not.toBe(supply.trustlineBaseUnits);
  });
});
