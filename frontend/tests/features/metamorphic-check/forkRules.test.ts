import { describe, expect, it } from "vitest";
import { evaluateForkRules } from "@/server/research/metamorphic-check";

describe("evaluateForkRules", () => {
  it("applies pre- and post-Cancun EIP-6780 rules per block", () => {
    expect(evaluateForkRules("ethereum", 15_000_000).eip6780Active).toBe(false);
    expect(evaluateForkRules("ethereum", 20_000_000).eip6780Active).toBe(true);
  });
});
