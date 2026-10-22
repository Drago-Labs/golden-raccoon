import { describe, expect, it } from "vitest";
import { findCreationBlock, findDeployerInBlock } from "@/server/research/deployer-history/deployerLookup";
import { scanDeployments } from "@/server/research/deployer-history/deploymentScan";
import { createAddress, recordedDeployerRpc, wallet } from "./fixtures";

describe("findCreationBlock", () => {
  it("binary-searches to the exact first block with code", async () => {
    const target = createAddress(wallet, 0);
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: { [target.toLowerCase()]: "347" },
      blocks: {},
    });

    expect(await findCreationBlock(rpc, target, 1000n)).toBe(347n);
  });

  it("returns null when the address has no code even at the latest block", async () => {
    const rpc = recordedDeployerRpc({ latestBlock: "1000", codeFromBlock: {}, blocks: {} });
    expect(await findCreationBlock(rpc, "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead", 1000n)).toBeNull();
  });

  it("finds a contract created in the very first block", async () => {
    const target = createAddress(wallet, 0);
    const rpc = recordedDeployerRpc({ latestBlock: "1000", codeFromBlock: { [target.toLowerCase()]: "0" }, blocks: {} });
    expect(await findCreationBlock(rpc, target, 1000n)).toBe(0n);
  });
});

describe("findDeployerInBlock", () => {
  it("identifies the direct deployer when a to:null tx reproduces the target address via CREATE", () => {
    const target = createAddress(wallet, 3);
    const block = {
      number: 100,
      transactions: [
        { hash: "0xa", from: wallet, to: null, nonce: 3, value: "0x0" },
        { hash: "0xb", from: "0x1234567890123456789012345678901234567890", to: null, nonce: 0, value: "0x0" },
      ],
    };

    const lookup = findDeployerInBlock(block, target);
    expect(lookup).toEqual({ deployer: wallet, creationBlock: 100, creationTxHash: "0xa", direct: true });
  });

  it("reports direct: false when no to:null tx in the block reproduces the target", () => {
    const target = createAddress(wallet, 5); // no tx in the block uses nonce 5
    const block = { number: 100, transactions: [{ hash: "0xa", from: wallet, to: null, nonce: 3, value: "0x0" }] };

    const lookup = findDeployerInBlock(block, target);
    expect(lookup).toEqual({ deployer: null, creationBlock: 100, creationTxHash: null, direct: false });
  });

  it("ignores transactions that call a contract rather than creating one", () => {
    const target = createAddress(wallet, 3);
    const block = {
      number: 100,
      transactions: [{ hash: "0xa", from: wallet, to: "0x1111111111111111111111111111111111111111", nonce: 3, value: "0x0" }],
    };
    expect(findDeployerInBlock(block, target).deployer).toBeNull();
  });
});

describe("scanDeployments", () => {
  it("finds other direct creations by the same deployer within the window, sorted oldest first", async () => {
    const first = createAddress(wallet, 0);
    const second = createAddress(wallet, 1);
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: {
        "100": [{ hash: "0xa", from: wallet, to: null, nonce: 0, value: "0x0" }],
        "105": [{ hash: "0xb", from: wallet, to: null, nonce: 1, value: "0x0" }],
      },
    });

    const { deployments, coverage } = await scanDeployments(rpc, wallet, 100n, 1000n, 20n);
    expect(deployments.map((d) => d.address)).toEqual([first, second]);
    expect(coverage).toEqual({ fromBlock: 80, toBlock: 120, truncated: false });
  });

  it("ignores creations by a different address", async () => {
    const other = "0x1234567890123456789012345678901234567890";
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: { "100": [{ hash: "0xa", from: other, to: null, nonce: 0, value: "0x0" }] },
    });

    const { deployments } = await scanDeployments(rpc, wallet, 100n, 1000n, 20n);
    expect(deployments).toEqual([]);
  });

  it("clamps the window to [0, latest]", async () => {
    const rpc = recordedDeployerRpc({ latestBlock: "10", codeFromBlock: {}, blocks: {} });
    const { coverage } = await scanDeployments(rpc, wallet, 5n, 10n, 20n);
    expect(coverage).toEqual({ fromBlock: 0, toBlock: 10, truncated: false });
  });
});
