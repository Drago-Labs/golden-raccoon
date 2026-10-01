import { describe, expect, it } from "vitest";
import { inspectLpCustody, type LpRpc } from "@/server/research/lp-custody-inspector";
import { burnAddress, lockAddress, pool, poolReader, unknownHolder } from "./fixtures";

const walletNetwork = { walletAddress: "0x9999999999999999999999999999999999999999", network: "ethereum", walletNetwork: "ethereum" } as const;

describe("LP custody inspector", () => {
  it("reads burned, claimed-locked and unknown holders across two different pools without conflating them", async () => {
    const readerA = poolReader({ totalSupply: 1_000n, balances: { [burnAddress]: 400n, [lockAddress]: 300n, [unknownHolder]: 100n } });
    const resultA = await inspectLpCustody(
      { ...walletNetwork, poolAddress: pool, candidates: [{ address: lockAddress, claimedUnlockTimestamp: 4_000_000_000 }, { address: unknownHolder }] },
      { rpc: readerA, now: () => 0 },
    );
    expect(resultA.model).toBe("constant_product_v2");
    expect(resultA.summary).toMatchObject({ burnedBasisPoints: 4_000, claimedLockedBasisPoints: 3_000, otherIdentifiedBasisPoints: 1_000, unaccountedBasisPoints: 2_000 });
    expect(resultA.candidates.find((c) => c.address === lockAddress)?.lockClaim.status).toBe("claimed_future");

    const readerB = poolReader({ totalSupply: 500n, balances: { [burnAddress]: 500n } });
    const resultB = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [] }, { rpc: readerB, now: () => 0 });
    expect(resultB.summary?.burnedBasisPoints).toBe(10_000);
    // Confirms the two independent reads did not share or leak state.
    expect(resultA.summary?.burnedBasisPoints).toBe(4_000);
  });

  it("never certifies a claimed lock or a burn address as proof of permanent liquidity", async () => {
    const reader = poolReader({ totalSupply: 100n, balances: { [lockAddress]: 100n } });
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [{ address: lockAddress, claimedUnlockTimestamp: 1 }] }, { rpc: reader, now: () => 1_000 });
    const candidate = result.candidates.find((c) => c.address === lockAddress)!;
    expect(candidate.lockClaim.verified).toBe(false);
    expect(candidate.lockClaim.status).toBe("claimed_past_or_expired");
    expect(candidate.classification).toBe("claimed_lock");
  });

  it("keeps an unread candidate balance unknown rather than assuming zero", async () => {
    const reader = poolReader({ totalSupply: 100n, missingCandidates: [unknownHolder] });
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [{ address: unknownHolder }] }, { rpc: reader });
    const candidate = result.candidates.find((c) => c.address === unknownHolder)!;
    expect(candidate.available).toBe(false);
    expect(candidate.balanceRaw).toBeNull();
    expect(candidate.basisPoints).toBeNull();
    expect(result.state).toBe("partial");
  });

  it("does not conflate a concentrated-liquidity position with a fungible V2 LP balance", async () => {
    const reader = poolReader({ concentratedLiquidity: true });
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [{ address: unknownHolder }] }, { rpc: reader });
    expect(result.model).toBe("concentrated_liquidity_unsupported");
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.some((w) => /not.*support|concentrated/i.test(w))).toBe(true);
  });

  it("flags a target with no token0/token1 as unrecognized rather than as an empty pool", async () => {
    const reader = poolReader({ failToken0: true });
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [] }, { rpc: reader });
    expect(result.model).toBe("unknown_contract");
    expect(result.summary).toBeNull();
  });

  it("flags a block hash change between the first and last read as a possible reorg", async () => {
    const reader = poolReader({ reorg: true });
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [] }, { rpc: reader });
    expect(result.reorgDetected).toBe(true);
    expect(result.state).toBe("partial");
  });

  it("keeps a provider failure distinguishable from a normal empty result", async () => {
    const reader: LpRpc = {
      async blockNumber() { throw new Error("RPC down"); },
      async blockHash() { return null; },
      async call() { return null; },
    };
    const result = await inspectLpCustody({ ...walletNetwork, poolAddress: pool, candidates: [] }, { rpc: reader });
    expect(result.state).toBe("unavailable");
    expect(result.blockNumber).toBeNull();
  });
});
