import { describe, expect, it } from "vitest";
import { lpCustodyRequestSchema, MAX_CANDIDATES } from "@/server/research/lp-custody-inspector";
import { pool, wallet } from "./fixtures";

describe("LP custody request validation", () => {
  const valid = { walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", poolAddress: pool, candidates: [] };

  it("accepts a configured, network-matched request", () => {
    expect(lpCustodyRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unsupported network, an invalid pool address, and a wallet/target network mismatch", () => {
    expect(lpCustodyRequestSchema.safeParse({ ...valid, network: "http://evil" }).success).toBe(false);
    expect(lpCustodyRequestSchema.safeParse({ ...valid, poolAddress: "not-an-address" }).success).toBe(false);
    expect(lpCustodyRequestSchema.safeParse({ ...valid, walletNetwork: "base" }).success).toBe(false);
  });

  it("rejects an invalid candidate address and a non-positive claimed unlock timestamp", () => {
    expect(lpCustodyRequestSchema.safeParse({ ...valid, candidates: [{ address: "bad" }] }).success).toBe(false);
    expect(lpCustodyRequestSchema.safeParse({ ...valid, candidates: [{ address: wallet, claimedUnlockTimestamp: -1 }] }).success).toBe(false);
  });

  it(`caps candidates at ${MAX_CANDIDATES}`, () => {
    const tooMany = Array.from({ length: MAX_CANDIDATES + 1 }, () => ({ address: wallet }));
    expect(lpCustodyRequestSchema.safeParse({ ...valid, candidates: tooMany }).success).toBe(false);
    const atLimit = Array.from({ length: MAX_CANDIDATES }, () => ({ address: wallet }));
    expect(lpCustodyRequestSchema.safeParse({ ...valid, candidates: atLimit }).success).toBe(true);
  });
});
