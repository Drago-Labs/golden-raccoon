import { describe, expect, it } from "vitest";
import { inspectVaultAccounting } from "@/server/research/vault-accounting/service";
import { recordedVaultRpc, vaultAddress } from "./fixtures";
import { VaultRpcError } from "@/server/research/vault-accounting/vaultReader";

import healthyVault from "./data/healthy-vault.json";
import assetsElsewhere from "./data/assets-elsewhere.json";
import nonconformingVault from "./data/nonconforming-vault.json";

const baseRequest = {
  walletAddress: "0x9999999999999999999999999999999999999999",
  network: "ethereum",
  walletNetwork: "ethereum",
  vaultAddress,
  sampleAmounts: [] as string[],
};

describe("inspectVaultAccounting", () => {
  it("reports a complete, conforming result for a healthy 1:1 vault with an exact-rounding sample", async () => {
    const result = await inspectVaultAccounting(
      { ...baseRequest, sampleAmounts: ["1000"] },
      { rpc: recordedVaultRpc(healthyVault) },
    );

    expect(result.state).toBe("complete");
    expect(result.conformance).toEqual({ conforming: true, missing: [] });
    expect(result.totalAssets).toBe("1000000");
    expect(result.totalSupply).toBe("1000000");
    expect(result.sharePrice).not.toBeNull();
    expect(result.roundingSamples).toEqual([
      { amount: "1000", sharesFromDeposit: "1000", assetsRoundTrip: "1000", lossRaw: "0", direction: "exact" },
    ]);
    expect(result.underlyingBalance).toEqual({
      totalAssets: "1000000",
      actualBalance: "1000000",
      assetsElsewhere: "0",
      deficit: false,
    });
    expect(result.priceJumps).toEqual([]);
    expect(result.coverage.reachedProvider).toBe(true);
  });

  it("reports assets held elsewhere when the vault's own balance is less than totalAssets", async () => {
    const result = await inspectVaultAccounting(baseRequest, { rpc: recordedVaultRpc(assetsElsewhere) });

    expect(result.underlyingBalance).toEqual({
      totalAssets: "1000000",
      actualBalance: "800000",
      assetsElsewhere: "200000",
      deficit: true,
    });
  });

  it("marks a vault missing previewRedeem as non-conforming and the result as partial", async () => {
    const result = await inspectVaultAccounting(baseRequest, { rpc: recordedVaultRpc(nonconformingVault) });

    expect(result.conformance.conforming).toBe(false);
    expect(result.conformance.missing).toContain("previewRedeem");
    expect(result.state).toBe("partial");
    expect(result.warnings.some((w) => w.includes("Non-conforming"))).toBe(true);
  });

  it("returns an unavailable result, never throwing, when the provider cannot be reached", async () => {
    const unreachable = {
      async blockNumber(): Promise<bigint> {
        throw new VaultRpcError("Provider request failed", "provider", true);
      },
      async blockHash() {
        return null;
      },
      async call(): Promise<string | null> {
        throw new VaultRpcError("Provider request failed", "provider", true);
      },
    };

    const result = await inspectVaultAccounting(baseRequest, { rpc: unreachable });

    expect(result.state).toBe("unavailable");
    expect(result.blockNumber).toBeNull();
    expect(result.coverage.reachedProvider).toBe(false);
    expect(result.warnings).toEqual(["Provider request failed"]);
  });

  it("rejects an unsupported network before any RPC call is made", async () => {
    await expect(inspectVaultAccounting({ ...baseRequest, network: "not-a-real-chain" })).rejects.toThrow(
      "Unsupported network",
    );
  });
});
