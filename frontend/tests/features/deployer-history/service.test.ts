import { describe, expect, it } from "vitest";
import { inspectDeployerHistory } from "@/server/research/deployer-history/service";
import { recordedDeployerRpc, wallet as fallbackWallet } from "./fixtures";
import { DeployerRpcError } from "@/server/research/deployer-history/deployerLookup";

import singleDeployment from "./data/single-deployment.json";
import serialDeployer from "./data/serial-deployer.json";
import factoryDeployment from "./data/factory-deployment.json";

function baseRequest(contractAddress: string) {
  return {
    walletAddress: fallbackWallet,
    network: "ethereum",
    walletNetwork: "ethereum",
    contractAddress,
  };
}

describe("inspectDeployerHistory", () => {
  it("profiles a deployer with exactly one deployment and no funding found", async () => {
    const result = await inspectDeployerHistory(baseRequest(singleDeployment.contractAddress), {
      rpc: recordedDeployerRpc(singleDeployment),
    });

    expect(result.lookup.deployer).toBe(singleDeployment.deployer);
    expect(result.lookup.direct).toBe(true);
    expect(result.deployments).toEqual([]); // the target itself is excluded from "other deployments"
    expect(result.templateGroups).toEqual([]);
    expect(result.fundingTrail).toEqual([{ hop: 1, address: singleDeployment.deployer, transactions: [] }]);
    expect(result.coverage.deployerFound).toBe(true);
  });

  it("groups a serial deployer's redeployed template and reports the funding trail", async () => {
    const result = await inspectDeployerHistory(baseRequest(serialDeployer.contractAddress), {
      rpc: recordedDeployerRpc(serialDeployer),
    });

    expect(result.lookup.deployer).toBe(serialDeployer.deployer);
    // All three deployments (target + 2 siblings) share the same fixture
    // code ("0x1234"), so the group should contain all three addresses.
    expect(result.templateGroups).toHaveLength(1);
    expect(result.templateGroups[0].deployments).toHaveLength(3);
    expect(result.templateGroups[0].deployments).toEqual(
      expect.arrayContaining([serialDeployer.contractAddress, ...serialDeployer.siblings]),
    );

    expect(result.fundingTrail[0].transactions[0].from).toBe(serialDeployer.funder);
  });

  it("reports direct: false and a warning when the deployer cannot be determined (factory deployment)", async () => {
    const result = await inspectDeployerHistory(baseRequest(factoryDeployment.contractAddress), {
      rpc: recordedDeployerRpc(factoryDeployment),
    });

    expect(result.lookup.deployer).toBeNull();
    expect(result.lookup.direct).toBe(false);
    expect(result.state).toBe("partial");
    expect(result.warnings.some((w) => w.toLowerCase().includes("factory"))).toBe(true);
    expect(result.deployments).toEqual([]);
  });

  it("reports a contract with no code as complete with an explanatory warning", async () => {
    const result = await inspectDeployerHistory(
      baseRequest("0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead"),
      { rpc: recordedDeployerRpc({ latestBlock: "1000", codeFromBlock: {}, blocks: {} }) },
    );

    expect(result.lookup.deployer).toBeNull();
    expect(result.lookup.creationBlock).toBeNull();
    expect(result.warnings[0]).toContain("no code");
  });

  it("returns an unavailable result, never throwing, when the provider cannot be reached", async () => {
    const unreachable = {
      async blockNumber(): Promise<bigint> {
        throw new DeployerRpcError("Provider request failed", "provider", true);
      },
      async getCode(): Promise<string> {
        throw new DeployerRpcError("Provider request failed", "provider", true);
      },
      async getBlock() {
        return null;
      },
    };

    const result = await inspectDeployerHistory(baseRequest("0x1111111111111111111111111111111111111111"), {
      rpc: unreachable,
    });

    expect(result.state).toBe("unavailable");
    expect(result.coverage.deployerFound).toBe(false);
    expect(result.warnings).toEqual(["Provider request failed"]);
  });

  it("rejects an unsupported network before any RPC call is made", async () => {
    await expect(
      inspectDeployerHistory({ ...baseRequest(singleDeployment.contractAddress), network: "not-a-real-chain" }),
    ).rejects.toThrow("Unsupported network");
  });
});
