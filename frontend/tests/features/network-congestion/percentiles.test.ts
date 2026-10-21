import { describe, expect, it } from "vitest";
import { inclusionFeePerOperation, nearestRankPercentile, summarizeFees } from "@/server/research/network-congestion/feePercentiles";
import { classicInclusionFee, splitSorobanFees } from "@/server/research/network-congestion/sorobanFees";
import type { ObservedLedger, ObservedTransaction } from "@/server/research/network-congestion/schema";
import { gapWindow, quietWindow, surgeWindow } from "./fixtures";

function distribution(samples: bigint[], percentile: 50 | 90 | 99): string {
  const sorted = [...samples].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  return nearestRankPercentile(sorted, percentile)!.toString();
}

describe("soroban fee split", () => {
  it("keeps rent inside the refundable resource fee", () => {
    const split = splitSorobanFees({
      feeChargedStroops: 5100n,
      nonRefundableStroops: 4000n,
      refundableStroops: 1000n,
      rentStroops: 100n,
    });

    expect(split).toEqual({ ok: true, inclusionFeeStroops: 100n, resourceFeeStroops: 5000n, rentStroops: 100n });
  });

  it("refuses a resource fee larger than the charged fee", () => {
    expect(
      splitSorobanFees({
        feeChargedStroops: 100n,
        nonRefundableStroops: 80n,
        refundableStroops: 50n,
        rentStroops: 10n,
      }).ok,
    ).toBe(false);
  });

  it("refuses rent that is larger than the refundable component", () => {
    const split = splitSorobanFees({
      feeChargedStroops: 200n,
      nonRefundableStroops: 50n,
      refundableStroops: 20n,
      rentStroops: 21n,
    });

    expect(split).toMatchObject({ ok: false, reason: "rent_exceeds_refundable" });
  });

  it("gives a classic charge no resource component", () => {
    expect(classicInclusionFee(200n)).toEqual({ inclusionFeeStroops: 200n, resourceFeeStroops: null });
    expect(classicInclusionFee(-1n)).toBeNull();
  });
});

describe("fee percentiles", () => {
  it("uses integer nearest-rank and floor division per operation", () => {
    expect(inclusionFeePerOperation("5", 2)).toBe(2n);
    expect(inclusionFeePerOperation("100", 0)).toBeNull();
    expect(distribution([200n, 200n, 400n, 1000n, 1000n], 50)).toBe("400");
    expect(distribution([200n, 200n, 400n, 1000n, 1000n], 90)).toBe("1000");
    expect(distribution([100n, 100n, 200n, 500n], 50)).toBe("100");
    expect(distribution([100n, 100n, 200n, 500n], 90)).toBe("500");
    expect(nearestRankPercentile([], 50)).toBeNull();
  });

  it("matches the quiet fixture without adding the resource fee to inclusion", () => {
    const fees = summarizeFees(quietWindow.ledgers);

    expect(fees.classicInclusion).toMatchObject({ sampleCount: 2, p50: "100", p90: "100", p99: "100", min: "100", max: "100" });
    expect(fees.sorobanInclusion).toMatchObject({ sampleCount: 1, p50: "100", p90: "100", p99: "100" });
    expect(fees.sorobanResource).toMatchObject({ sampleCount: 1, p50: "5000", unit: "stroops", rentStroopsIncluded: "100" });
    expect(JSON.stringify(fees)).not.toContain("5100");
    expect(Object.keys(fees).sort()).toEqual(["classicInclusion", "sorobanInclusion", "sorobanResource"]);
  });

  it("matches the surge fixture, including a failed transaction that was still included", () => {
    const fees = summarizeFees(surgeWindow.ledgers);

    expect(fees.classicInclusion).toMatchObject({
      sampleCount: 5,
      p50: "400",
      p90: "1000",
      p99: "1000",
      min: "200",
      max: "1000",
      unit: "stroops_per_operation",
    });
    expect(fees.sorobanInclusion.p50).toBe("1000");
    expect(fees.sorobanResource).toMatchObject({ p50: "3000", p90: "3000", p99: "3000", rentStroopsIncluded: "250" });
    expect(JSON.stringify(fees)).not.toContain("5000");
  });

  it("matches the gapped fixture and does not invent a sample for the missing ledger", () => {
    const fees = summarizeFees(gapWindow.ledgers);

    expect(fees.classicInclusion).toMatchObject({ sampleCount: 4, p50: "100", p90: "500", p99: "500", min: "100", max: "500" });
    expect(fees.sorobanInclusion.sampleCount).toBe(0);
    expect(fees.sorobanResource.p50).toBeNull();
    expect(fees.sorobanResource.rentStroopsIncluded).toBe("0");
  });

  it("drops an unclassified Soroban transaction from both series", () => {
    const unsplit: ObservedTransaction = {
      hash: "unsplit",
      operationCount: 1,
      successful: true,
      classicInclusionFeeStroops: null,
      sorobanInclusionFeeStroops: null,
      sorobanResourceFeeStroops: null,
      sorobanRentFeeStroops: null,
      split: "unsplit",
    };
    const ledger: ObservedLedger = { ...quietWindow.ledgers[1], transactions: [unsplit] };
    const fees = summarizeFees([ledger]);

    expect(fees.classicInclusion.sampleCount).toBe(0);
    expect(fees.sorobanInclusion.sampleCount).toBe(0);
    expect(fees.sorobanResource.sampleCount).toBe(0);
  });
});
