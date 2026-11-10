import { describe, expect, it } from "vitest";
import { assertSameLimitNetwork, DEFAULT_NETWORK_LIMITS } from "@/server/research/resource-headroom";

describe("networkLimits", () => {
  it("ties limits to their network and ledger and rejects cross-network mismatches", () => {
    expect(DEFAULT_NETWORK_LIMITS["stellar-testnet"].ledger).toBeGreaterThan(0);
    expect(() => assertSameLimitNetwork("stellar-testnet", "stellar-mainnet")).toThrow(
      /Network limits belonged/,
    );
  });
});
