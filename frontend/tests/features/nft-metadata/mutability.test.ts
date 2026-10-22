import { describe, expect, it } from "vitest";
import { assessMutability } from "@/server/research/nft-metadata/mutability";
import { contractAddress, nftReader, ownerAddress } from "./fixtures";

describe("assessMutability", () => {
  it("reads the owner when present", async () => {
    const rpc = nftReader({ owner: ownerAddress });
    const result = await assessMutability(rpc, contractAddress, 100n);
    expect(result.owner).toBe(ownerAddress);
  });

  it("reports no owner evidence when owner() is not implemented", async () => {
    const rpc = nftReader({});
    const result = await assessMutability(rpc, contractAddress, 100n);
    expect(result.owner).toBeNull();
  });

  it("detects a base-URI setter when the probe reverts with an access-control reason", async () => {
    const rpc = nftReader({ setterRevertReasons: { "setBaseURI(string)": "Ownable: caller is not the owner" } });
    const result = await assessMutability(rpc, contractAddress, 100n);
    const signal = result.baseUriSetterSignals.find((s) => s.name === "setBaseURI(string)");
    expect(signal?.detected).toBe(true);
    expect(signal?.evidence).toContain("Ownable: caller is not the owner");
  });

  it("does not claim detection for a revert with an unrecognized reason", async () => {
    const rpc = nftReader({ setterRevertReasons: { "setURI(string)": "InsufficientBalance" } });
    const result = await assessMutability(rpc, contractAddress, 100n);
    const signal = result.baseUriSetterSignals.find((s) => s.name === "setURI(string)");
    expect(signal?.detected).toBe(false);
  });

  it("does not claim detection when the probe call simply succeeds or reverts with no reason", async () => {
    const rpc = nftReader({});
    const result = await assessMutability(rpc, contractAddress, 100n);
    for (const signal of result.baseUriSetterSignals) {
      expect(signal.detected).toBe(false);
      expect(signal.evidence).toMatch(/no evidence either way/);
    }
  });

  it("reports a freeze flag's value when present, and absence when not implemented", async () => {
    const rpc = nftReader({ freezeFlags: { isFrozen: true } });
    const result = await assessMutability(rpc, contractAddress, 100n);
    const isFrozen = result.freezeFlags.find((s) => s.name === "isFrozen()");
    const frozen = result.freezeFlags.find((s) => s.name === "frozen()");
    expect(isFrozen?.detected).toBe(true);
    expect(isFrozen?.evidence).toContain("frozen");
    expect(frozen?.detected).toBe(false);
  });

  it("counts ERC-4906 metadata-update events separately for single and batch variants", async () => {
    const rpc = nftReader({ metadataUpdateLogCount: 2, batchMetadataUpdateLogCount: 1 });
    const result = await assessMutability(rpc, contractAddress, 100n);
    expect(result.metadataUpdateScan.metadataUpdateCount).toBe(2);
    expect(result.metadataUpdateScan.batchMetadataUpdateCount).toBe(1);
  });

  it("truncates the metadata-update scan window and reports it when the chain is taller than the window", async () => {
    const rpc = nftReader({ blockNumber: 1_000_000n });
    const result = await assessMutability(rpc, contractAddress, 1_000_000n, 50_000n);
    expect(result.metadataUpdateScan.truncated).toBe(true);
    expect(result.metadataUpdateScan.fromBlock).toBe((1_000_000n - 50_000n).toString());
  });

  it("does not truncate when the chain has fewer blocks than the window", async () => {
    const rpc = nftReader({ blockNumber: 100n });
    const result = await assessMutability(rpc, contractAddress, 100n, 50_000n);
    expect(result.metadataUpdateScan.truncated).toBe(false);
    expect(result.metadataUpdateScan.fromBlock).toBe("0");
  });
});
