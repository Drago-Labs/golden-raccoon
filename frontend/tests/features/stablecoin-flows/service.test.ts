import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listAssets,
  STABLECOIN_FLOW_LIMITS,
  StablecoinFlowError,
  trackStablecoinFlows,
  type StablecoinFlowDeps,
} from "@/server/research/stablecoin-flows";
import { deploymentSources, findAsset, selectDeployments } from "@/server/research/stablecoin-flows/assetRegistry";
import { readEvmFlowEvents } from "@/server/research/stablecoin-flows/evmEvents";
import { readStellarFlowEvents } from "@/server/research/stablecoin-flows/stellarEvents";
import { clone, EVM_RPC, fixtures, flowRequest, HORIZON, recordedFetch, usdc } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

/** Wires the real readers to recorded responses, so only the network is replaced. */
function recordedDeps(fixture: unknown, chainOf?: (url: string) => string): StablecoinFlowDeps {
  const fetchMock = recordedFetch(clone(fixture) as never, chainOf ? { chainOf } : {});
  vi.stubGlobal("fetch", fetchMock);
  return {
    readEvm: (deployment, window) => readEvmFlowEvents(`https://${deployment.chain}.test.invalid`, deployment, window),
    readStellar: (deployment, window) => readStellarFlowEvents(HORIZON, deployment, window),
  };
}

describe("trackStablecoinFlows: input", () => {
  const unusedDeps: StablecoinFlowDeps = {
    readEvm: vi.fn(async () => ({ events: [], truncated: false, coversWindowStart: true })),
    readStellar: vi.fn(async () => ({ payments: [], truncated: false, reachedWindowStart: true })),
  };

  it("rejects a malformed request with a typed error", async () => {
    await expect(trackStablecoinFlows({}, unusedDeps)).rejects.toBeInstanceOf(StablecoinFlowError);
    await expect(trackStablecoinFlows(flowRequest({ windowEnd: "2026-11-17T00:00:00.000Z" }), unusedDeps)).rejects.toThrowError(
      /request is invalid/,
    );
  });

  it("rejects an unknown asset and a chain the asset is not configured on", async () => {
    await expect(trackStablecoinFlows(flowRequest({ assetId: "not-a-coin" }), unusedDeps)).rejects.toThrowError(
      /No stablecoin is configured/,
    );
    await expect(trackStablecoinFlows(flowRequest({ chains: ["solana"] }), unusedDeps)).rejects.toThrowError(
      /not configured on "solana"/,
    );
  });
});

describe("trackStablecoinFlows: the recorded multi-chain fixture", () => {
  it("answers with hand-checkable daily totals, net issuance and largest events", async () => {
    const deps = recordedDeps(fixtures.multiChain);
    const result = await trackStablecoinFlows(flowRequest(), deps);
    expect(result.state).toBe("ready");
    const report = result.report;

    expect(report.state).toBe("complete");
    expect(report.asset).toEqual({ id: "usdc", symbol: "USDC", name: "USD Coin", canonicalDecimals: 7 });
    expect(report.window).toEqual({ start: "2026-11-18T00:00:00.000Z", end: "2026-11-20T00:00:00.000Z", days: 2 });

    expect(report.daily.map((row) => [row.day, row.chain, row.mint, row.burn, row.net])).toEqual([
      ["2026-11-18", "ethereum", "1000000", "250000", "750000"],
      ["2026-11-18", "stellar", "50000", "0", "50000"],
      ["2026-11-19", "ethereum", "0", "400000", "-400000"],
      ["2026-11-19", "stellar", "10000", "0", "10000"],
      ["2026-11-20", "ethereum", "0", "0", "0"],
      ["2026-11-20", "stellar", "0", "0", "0"],
    ]);

    // Minted 1,060,000 and burned 650,000 across both chains leaves 410,000.
    expect(report.netIssuance).toMatchObject({ mint: "1060000", burn: "650000", net: "410000", eventCount: 5 });
    expect(report.netByChain.map((row) => [row.chain, row.net])).toEqual([
      ["ethereum", "350000"],
      ["stellar", "60000"],
    ]);

    const recordedMint = fixtures.multiChain.evm.ethereum.logs.find((log) => log._direction === "mint")!;
    expect(report.largestEvents[0]).toMatchObject({
      chain: "ethereum",
      direction: "mint",
      amount: "1000000",
      txId: recordedMint.transactionHash,
      txUrl: `https://etherscan.io/tx/${recordedMint.transactionHash}`,
    });
    expect(report.largestEvents).toHaveLength(5);
    expect(report.coverage.map((row) => [row.chain, row.state])).toEqual([
      ["ethereum", "complete"],
      ["stellar", "complete"],
    ]);
    expect(report.readOnly).toBe(true);
  });

  it("counts only the issuer's own asset movements on Stellar", async () => {
    const deps = recordedDeps(fixtures.singleChain);
    const result = await trackStablecoinFlows(flowRequest({ chains: ["stellar"] }), deps);
    // The recorded page also holds a EURC payment, a third-party USDC payment and a create_account operation.
    expect(result.report.netIssuance).toMatchObject({ mint: "60000", burn: "0", net: "60000", eventCount: 2 });
    expect(result.report.coverage.map((row) => row.chain)).toEqual(["stellar"]);
  });

  it("reads every configured chain when none is named", async () => {
    const deps: StablecoinFlowDeps = {
      readEvm: vi.fn(async () => ({ events: [], truncated: false, coversWindowStart: true })),
      readStellar: vi.fn(async () => ({ payments: [], truncated: false, reachedWindowStart: true })),
    };
    const result = await trackStablecoinFlows(flowRequest({ chains: [] }), deps);
    expect(result.report.coverage.map((row) => row.chain)).toEqual(usdc().deployments.map((item) => item.chain));
    expect(deps.readEvm).toHaveBeenCalledTimes(6);
    expect(deps.readStellar).toHaveBeenCalledTimes(1);
  });
});

describe("trackStablecoinFlows: incomplete evidence", () => {
  it("keeps a failed chain out of the totals and says so", async () => {
    const deps = recordedDeps(fixtures.partialCoverage);
    const result = await trackStablecoinFlows(flowRequest({ chains: ["ethereum", "base"] }), deps);
    expect(result.state).toBe("ready");
    expect(result.report.state).toBe("partial");

    const [ethereum, base] = result.report.coverage;
    expect(ethereum).toMatchObject({ chain: "ethereum", state: "unavailable", eventCount: 0 });
    expect(base).toMatchObject({ chain: "base", state: "partial", eventCount: 1 });
    // Only the chain that answered contributes rows, so a failure never reads as a zero.
    expect([...new Set(result.report.daily.map((row) => row.chain))]).toEqual(["base"]);
    expect(result.report.netIssuance).toMatchObject({ mint: "25000", net: "25000" });
    expect(result.report.notes.join(" ")).toMatch(/absent from every total: ethereum/);
    expect(result.report.notes.join(" ")).toMatch(/a floor rather than a sum: base/);
  });

  it("reports every chain failing as unavailable without inferring a figure", async () => {
    const deps = recordedDeps(fixtures.providerUnavailable, () => "ethereum");
    const result = await trackStablecoinFlows(flowRequest({ chains: ["ethereum", "stellar"] }), deps);
    expect(result.state).toBe("unavailable");
    expect(result).toMatchObject({
      reason: "No configured chain could be read for this asset. No mint, burn or net issuance was inferred.",
    });
    expect(result.report.daily).toEqual([]);
    expect(result.report.netIssuance).toMatchObject({ mint: "0", burn: "0", net: "0", eventCount: 0 });
    expect(result.report.largestEvents).toEqual([]);
    expect(result.report.coverage.every((row) => row.state === "unavailable")).toBe(true);
  });

  it("treats a malformed provider answer as that chain's failure, not a crash", async () => {
    const deps: StablecoinFlowDeps = {
      readEvm: async () => {
        throw new StablecoinFlowError("malformed_response", "eth_getLogs did not return a list.");
      },
      readStellar: async () => ({ payments: [], truncated: false, reachedWindowStart: true }),
    };
    const result = await trackStablecoinFlows(flowRequest(), deps);
    expect(result.report.coverage[0]).toMatchObject({ state: "unavailable" });
    expect(result.report.coverage[0].notes.join(" ")).toMatch(/did not return a list/);
  });

  it("drops an event the chain timestamped outside the requested window", async () => {
    const deps: StablecoinFlowDeps = {
      readEvm: async () => ({
        events: [
          {
            direction: "mint" as const,
            amount: "1000000",
            blockNumber: 1,
            blockTimestamp: Date.parse("2026-11-01T00:00:00Z") / 1000,
            txHash: `0x${"b".repeat(64)}`,
            logIndex: 0,
          },
        ],
        truncated: false,
        coversWindowStart: true,
      }),
      readStellar: async () => ({ payments: [], truncated: false, reachedWindowStart: true }),
    };
    const result = await trackStablecoinFlows(flowRequest(), deps);
    expect(result.report.netIssuance.eventCount).toBe(0);
  });

  it("never returns anything a caller could submit", async () => {
    const deps = recordedDeps(fixtures.multiChain);
    const result = await trackStablecoinFlows(flowRequest(), deps);
    expect(JSON.stringify(result)).not.toMatch(/signature|signedTx|xdr|calldata|privateKey/i);
  });
});

describe("the asset registry", () => {
  it("publishes every configured asset with its chains", () => {
    const assets = listAssets();
    expect(assets.map((asset) => asset.id)).toEqual(["usdc", "eurc", "usdt"]);
    expect(assets[0].chains).toContain("stellar");
  });

  it("canonicalizes each asset to the largest decimals of its deployments", () => {
    for (const asset of ["usdc", "eurc", "usdt"].map(findAsset)) {
      expect(asset.canonicalDecimals).toBe(Math.max(...asset.deployments.map((item) => item.decimals)));
    }
  });

  it("keeps EVM addresses lower-cased so one deployment has one identity", () => {
    for (const deployment of findAsset("usdt").deployments) {
      if (deployment.kind === "evm") expect(deployment.address).toBe(deployment.address.toLowerCase());
    }
  });

  it("names a published source for every deployment", () => {
    const sources = deploymentSources(findAsset("usdc").deployments);
    expect(sources).toHaveLength(7);
    expect(sources.every((source) => source.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("selects the named chains in the order they were asked for", () => {
    const selected = selectDeployments(findAsset("usdc"), ["stellar", "base"]);
    expect(selected.map((item) => item.chain)).toEqual(["stellar", "base"]);
  });
});

describe("the public entry point", () => {
  it("publishes the documented bounds", () => {
    expect(STABLECOIN_FLOW_LIMITS).toMatchObject({
      maxRequestBytes: 32_768,
      maxWindowDays: 90,
      maxEventsPerChain: 500,
      maxRankedEvents: 25,
    });
  });

  it("publishes a typed error with a stable code", () => {
    const error = new StablecoinFlowError("unknown_asset", "nope");
    expect(error).toBeInstanceOf(Error);
    expect([error.name, error.code]).toEqual(["StablecoinFlowError", "unknown_asset"]);
  });

  it("reaches the real readers through the exported service", async () => {
    const deps = recordedDeps(fixtures.multiChain);
    void EVM_RPC;
    const result = await trackStablecoinFlows(flowRequest({ chains: ["ethereum"] }), deps);
    expect(result.report.coverage[0].sourceUrl).toMatch(/^https:\/\//);
  });
});
