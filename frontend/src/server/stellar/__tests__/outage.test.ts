import { describe, expect, it } from "vitest";
import { ProbeScheduler } from "../probes/schedule";
import { EndpointSelector } from "../transport/selector";
import { StellarRpcDataLayer } from "../dataLayer";
import type { StellarRpcTransport } from "../dataLayer";

function deadTransport(): StellarRpcTransport {
  return {
    async getHealth(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async getNetwork(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async getLatestLedger(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async getLedgerEntries(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async simulateTransaction(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async sendTransaction(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async getTransaction(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
    async getEvents(): Promise<never> {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    },
  };
}

describe("Stellar RPC Network-Wide Outage Surface", () => {
  const endpoints = ["https://rpc1.test", "https://rpc2.test"];

  it("detects and classifies network-wide outage when all endpoints fail", async () => {
    const scheduler = new ProbeScheduler({
      endpoints,
      transportFactory: () => deadTransport(),
      expectedPassphrase: "Test SDF Network ; September 2015",
      expectedProtocolVersion: 22,
    });

    await scheduler.probeAll();

    const selector = new EndpointSelector(scheduler);
    const outageStatus = selector.getOutageStatus();

    expect(outageStatus.isOutage).toBe(true);
    expect(outageStatus.reason).toContain("All 2 configured RPC endpoints are down or degraded");
    expect(outageStatus.healthyCount).toBe(0);
    expect(outageStatus.unhealthyCount).toBe(2);
  });

  it("reports network outage on StellarRpcDataLayer health surface", async () => {
    const layer = new StellarRpcDataLayer("stellar-testnet", {
      providerUrls: endpoints,
      transportFactory: () => deadTransport(),
    });

    const health = await layer.getHealth("health-req-1");

    expect(health.healthy).toBe(false);
    expect(health.outage).toBeDefined();
    expect(health.outage?.isOutage).toBe(true);
    expect(health.outage?.reason).toContain("All 2 configured RPC endpoints are down");
    expect(health.providers).toHaveLength(2);
    expect(health.providers[0]!.score).toBeDefined();
    expect(health.providers[0]!.state).toBe("unhealthy");
  });

  it("execute throws network-wide outage error when all endpoints are down", async () => {
    const layer = new StellarRpcDataLayer("stellar-testnet", {
      providerUrls: endpoints,
      transportFactory: () => deadTransport(),
      totalBudgetMs: 2000,
    });

    await expect(
      layer.getEvents({ startLedger: 100 }),
    ).rejects.toThrow(/Network-wide outage detected/);
  });
});
