import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { groupByCodeHash, hashDeployments } from "@/server/research/deployer-history/codeHashGrouping";
import { recordedDeployerRpc } from "./fixtures";
import type { Deployment } from "@/server/research/deployer-history/schema";

const addrA = "0x1111111111111111111111111111111111111111";
const addrB = "0x2222222222222222222222222222222222222222";
const addrC = "0x3333333333333333333333333333333333333333";

describe("hashDeployments", () => {
  it("hashes each deployment's runtime code at its own block", async () => {
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: { [addrA.toLowerCase()]: "0" },
      blocks: {},
    });
    // getCode in the fixture returns "0x1234" once the address has code.
    const deployments: Deployment[] = [{ address: addrA, blockNumber: 100, txHash: "0xa", codeHash: null }];

    const hashed = await hashDeployments(rpc, deployments);
    expect(hashed[0].codeHash).toBe(keccak256("0x1234"));
  });

  it("leaves codeHash null when the address has no code", async () => {
    const rpc = recordedDeployerRpc({ latestBlock: "1000", codeFromBlock: {}, blocks: {} });
    const deployments: Deployment[] = [{ address: addrA, blockNumber: 100, txHash: "0xa", codeHash: null }];

    const hashed = await hashDeployments(rpc, deployments);
    expect(hashed[0].codeHash).toBeNull();
  });
});

describe("groupByCodeHash", () => {
  const hashX = keccak256("0xaaaa");
  const hashY = keccak256("0xbbbb");

  it("groups deployments that share a code hash", () => {
    const deployments: Deployment[] = [
      { address: addrA, blockNumber: 1, txHash: "0xa", codeHash: hashX },
      { address: addrB, blockNumber: 2, txHash: "0xb", codeHash: hashX },
      { address: addrC, blockNumber: 3, txHash: "0xc", codeHash: hashY },
    ];

    const groups = groupByCodeHash(deployments);
    expect(groups).toEqual([{ codeHash: hashX, deployments: [addrA, addrB] }]);
  });

  it("excludes a hash with only one deployment — it isn't reuse", () => {
    const deployments: Deployment[] = [{ address: addrA, blockNumber: 1, txHash: "0xa", codeHash: hashX }];
    expect(groupByCodeHash(deployments)).toEqual([]);
  });

  it("ignores deployments with no code hash", () => {
    const deployments: Deployment[] = [
      { address: addrA, blockNumber: 1, txHash: "0xa", codeHash: null },
      { address: addrB, blockNumber: 2, txHash: "0xb", codeHash: null },
    ];
    expect(groupByCodeHash(deployments)).toEqual([]);
  });
});
