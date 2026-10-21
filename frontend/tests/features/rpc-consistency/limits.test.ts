import { describe, expect, it } from "vitest";
import { batchKeys, clampList, CONSISTENCY_LIMITS, maxLedgerKeys } from "@/server/research/rpc-consistency/limits";

describe("limits", () => {
  it("publishes timeout, page, and size bounds", () => {
    expect(CONSISTENCY_LIMITS.timeoutMs).toBe(8_000);
    expect(CONSISTENCY_LIMITS.maxRequestBytes).toBe(32_768);
    expect(CONSISTENCY_LIMITS.maxTrustlines).toBe(50);
    expect(CONSISTENCY_LIMITS.maxContractKeys).toBe(20);
    expect(maxLedgerKeys()).toBe(CONSISTENCY_LIMITS.maxPages * CONSISTENCY_LIMITS.pageSize);
  });

  it("counts items past the cap instead of dropping them silently", () => {
    const result = clampList([1, 2, 3, 4], 2);

    expect(result.kept).toEqual([1, 2]);
    expect(result.omitted).toBe(2);
  });

  it("stops paging once the page budget is spent", () => {
    const result = batchKeys([1, 2, 3, 4, 5], 2, 2);

    expect(result.pages).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(result.omitted).toBe(1);
  });
});
