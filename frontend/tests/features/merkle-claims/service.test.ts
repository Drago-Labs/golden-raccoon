import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPublicHttpsText: vi.fn() }));
vi.mock("@/server/security/publicHttpsText", () => ({ readPublicHttpsText: mocks.readPublicHttpsText }));

import { verifyMerkleClaim } from "@/server/research/merkle-claims/service";
import type { LeafEncoding } from "@/server/research/merkle-claims/leafEncoding";
import alreadyClaimed from "./data/already-claimed.json";
import providerUnavailable from "./data/provider-unavailable.json";
import tamperedTree from "./data/tampered-tree.json";
import validClaim from "./data/valid-claim.json";
import { distributorAddress, merkleReader, wallet } from "./fixtures";

type RpcFixture = { blockNumber?: string; failBlockNumber?: boolean; merkleRoot?: string; token?: string; isClaimedFor?: Record<string, boolean> };
type Fixture = { rpc: RpcFixture; treeSource: string; treeFileBody: string; claimAddress: string; leafEncoding: LeafEncoding };

function install(fixture: Fixture) {
  mocks.readPublicHttpsText.mockResolvedValue(fixture.treeFileBody);
  return merkleReader({
    blockNumber: fixture.rpc.blockNumber !== undefined ? BigInt(fixture.rpc.blockNumber) : undefined,
    failBlockNumber: fixture.rpc.failBlockNumber,
    merkleRoot: fixture.rpc.merkleRoot as `0x${string}` | undefined,
    token: fixture.rpc.token,
    isClaimedFor: fixture.rpc.isClaimedFor,
  });
}

const network = "ethereum";

function requestFor(fixture: Fixture) {
  return {
    walletAddress: wallet,
    network,
    walletNetwork: network,
    distributorAddress,
    claimAddress: fixture.claimAddress,
    treeSource: fixture.treeSource,
    leafEncoding: fixture.leafEncoding,
  };
}

describe("verifyMerkleClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a complete, eligible result for a valid claim", async () => {
    const fixture = validClaim as Fixture;
    const rpc = install(fixture);

    const result = await verifyMerkleClaim(requestFor(fixture), { rpc });

    expect(result.state).toBe("complete");
    expect(result.proof.valid).toBe(true);
    expect(result.claim.eligible).toBe(true);
    expect(result.claim.alreadyClaimed).toBe(false);
  });

  it("blocks eligibility for a tampered tree entry even though the on-chain root is read successfully", async () => {
    const fixture = tamperedTree as Fixture;
    const rpc = install(fixture);

    const result = await verifyMerkleClaim(requestFor(fixture), { rpc });

    expect(result.proof.valid).toBe(false);
    expect(result.claim.eligible).toBe(false);
    expect(result.claim.reason).toMatch(/does not fold up/i);
  });

  it("reports not-eligible when the claim was already made on-chain", async () => {
    const fixture = alreadyClaimed as Fixture;
    const rpc = install(fixture);

    const result = await verifyMerkleClaim(requestFor(fixture), { rpc });

    expect(result.proof.valid).toBe(true);
    expect(result.claim.alreadyClaimed).toBe(true);
    expect(result.claim.eligible).toBe(false);
    expect(result.claim.reason).toMatch(/already claimed/i);
  });

  it("reports unavailable when the provider cannot be reached at all", async () => {
    const fixture = providerUnavailable as Fixture;
    const rpc = install(fixture);

    const result = await verifyMerkleClaim(requestFor(fixture), { rpc });

    expect(result.state).toBe("unavailable");
    expect(result.claim.eligible).toBe(false);
  });

  it("reports partial and does not claim eligibility when an address has no entry in the tree", async () => {
    const fixture = validClaim as Fixture;
    const rpc = install(fixture);

    const result = await verifyMerkleClaim({ ...requestFor(fixture), claimAddress: `0x${"9".repeat(40)}` }, { rpc });

    expect(result.claim.inTree).toBe(false);
    expect(result.claim.eligible).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("not found"))).toBe(true);
  });

  it("reports partial when the tree file fails to load", async () => {
    const fixture = validClaim as Fixture;
    mocks.readPublicHttpsText.mockRejectedValue(new Error("HTTP 404"));
    const rpc = merkleReader({ merkleRoot: fixture.rpc.merkleRoot as `0x${string}`, isClaimedFor: fixture.rpc.isClaimedFor });

    const result = await verifyMerkleClaim(requestFor(fixture), { rpc });

    expect(result.state).toBe("partial");
    expect(result.tree.loaded).toBe(false);
    expect(result.claim.eligible).toBe(false);
  });

  it("throws a typed error for an unsupported network before touching the provider", async () => {
    const fixture = validClaim as Fixture;
    await expect(
      verifyMerkleClaim({ ...requestFor(fixture), network: "not-a-network", walletNetwork: "not-a-network" }),
    ).rejects.toThrow(/unsupported network/i);
  });
});
