import { describe, expect, it } from "vitest";
import { unavailable } from "@/server/research/rpc-consistency/errors";
import { providerStatuses } from "@/server/research/rpc-consistency/providerStatus";
import { matched, unavailable as unavailableFixture } from "./fixtures";

describe("provider status", () => {
  it("reports latest ledger and retention for each provider", () => {
    if (matched.horizon.status !== "available" || matched.rpc.status !== "available") {
      throw new Error("matched fixture should be available");
    }

    const [horizon, rpc] = providerStatuses({
      network: "testnet",
      horizonEndpoint: matched.horizon.observation.endpoint,
      rpcEndpoint: matched.rpc.observation.endpoint,
      horizon: matched.horizon,
      rpc: matched.rpc,
    });

    expect(horizon?.latestLedger).toBe(5100);
    expect(horizon?.retentionStartLedger).toBe(1000);
    expect(horizon?.retentionEndLedger).toBe(5100);
    expect(horizon?.detail).toMatch(/Retention window is ledgers 1000–5100/);
    expect(rpc?.latestLedger).toBe(5100);
    expect(rpc?.network).toBe("testnet");
  });

  it("labels an unavailable provider and does not copy the other ledger", () => {
    if (unavailableFixture.rpc.status !== "available" || unavailableFixture.horizon.status !== "unavailable") {
      throw new Error("unavailable fixture shape");
    }

    const [horizon, rpc] = providerStatuses({
      network: "testnet",
      horizonEndpoint: "https://horizon-testnet.stellar.org",
      rpcEndpoint: unavailableFixture.rpc.observation.endpoint,
      horizon: unavailableFixture.horizon,
      rpc: unavailableFixture.rpc,
    });

    expect(horizon?.availability).toBe("unavailable");
    expect(horizon?.label).toBe("Horizon unavailable");
    expect(horizon?.latestLedger).toBeNull();
    expect(horizon?.detail).toMatch(/timed out/i);
    expect(rpc?.availability).toBe("available");
    expect(rpc?.latestLedger).toBe(5100);
  });

  it("keeps a constructed unavailable state on the requested network", () => {
    const [horizon] = providerStatuses({
      network: "mainnet",
      horizonEndpoint: "https://horizon.stellar.org",
      rpcEndpoint: "https://mainnet.sorobanrpc.com",
      horizon: unavailable("down"),
      rpc: unavailable("down"),
    });

    expect(horizon?.network).toBe("mainnet");
    expect(horizon?.endpoint).toBe("https://horizon.stellar.org");
  });
});
