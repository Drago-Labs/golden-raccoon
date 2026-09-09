import { describe, expect, it } from "vitest";
import { ProbeScheduler } from "../probes/schedule";
import { EndpointSelector } from "../transport/selector";
import type { StellarRpcTransport } from "../dataLayer";

function mockTransport(options: {
  healthy?: boolean;
  ledger?: number;
  passphrase?: string;
  protocolVersion?: number;
  delayMs?: number;
}): StellarRpcTransport {
  return {
    async getHealth() {
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
      return { status: options.healthy ?? true ? "healthy" : "unhealthy" };
    },
    async getNetwork() {
      return {
        passphrase: options.passphrase ?? "Test SDF Network ; September 2015",
        protocolVersion: options.protocolVersion ?? 22,
      };
    },
    async getLatestLedger() {
      return { sequence: options.ledger ?? 1000 };
    },
    async getLedgerEntries() {
      return { entries: [], latestLedger: options.ledger ?? 1000 };
    },
    async simulateTransaction() {
      return { minResourceFee: "100" } as unknown as ReturnType<StellarRpcTransport["simulateTransaction"]>;
    },
    async sendTransaction() {
      return { status: "PENDING", hash: "test-hash" } as unknown as ReturnType<StellarRpcTransport["sendTransaction"]>;
    },
    async getTransaction() {
      return { status: "SUCCESS" } as unknown as ReturnType<StellarRpcTransport["getTransaction"]>;
    },
    async getEvents() {
      return { events: [], latestLedger: options.ledger ?? 1000 };
    },
  };
}

describe("Stellar RPC Endpoint Selector", () => {
  const endpoints = [
    "https://primary.test",
    "https://secondary.test",
    "https://backup.test",
  ];

  it("selects the highest-scoring healthy endpoint", async () => {
    const transports: Record<string, StellarRpcTransport> = {
      "https://primary.test": mockTransport({ ledger: 1000 }),
      "https://secondary.test": mockTransport({ ledger: 1000 }),
      "https://backup.test": mockTransport({ ledger: 1000 }),
    };

    const scheduler = new ProbeScheduler({
      endpoints,
      transportFactory: (url) => transports[url]!,
      expectedPassphrase: "Test SDF Network ; September 2015",
      expectedProtocolVersion: 22,
    });

    await scheduler.probeAll();

    scheduler.recordOutcome("https://primary.test", { ok: true, latencyMs: 20 });
    scheduler.recordOutcome("https://secondary.test", { ok: true, latencyMs: 300 });
    scheduler.recordOutcome("https://backup.test", { ok: true, latencyMs: 400 });

    const selector = new EndpointSelector(scheduler);
    const selected = selector.selectBestEndpoint();

    expect(selected.safeUrl).toBe("https://primary.test");
    expect(selected.score).toBeGreaterThanOrEqual(90);
  });

  it("excludes lagging and unhealthy endpoints from selection", async () => {
    const transports: Record<string, StellarRpcTransport> = {
      "https://primary.test": mockTransport({ ledger: 990 }),
      "https://secondary.test": mockTransport({ ledger: 1000 }),
      "https://backup.test": mockTransport({ healthy: false, ledger: 1000 }),
    };

    const scheduler = new ProbeScheduler({
      endpoints,
      transportFactory: (url) => transports[url]!,
      expectedPassphrase: "Test SDF Network ; September 2015",
      expectedProtocolVersion: 22,
      maxLag: 3,
    });

    await scheduler.probeAll();

    const selector = new EndpointSelector(scheduler);
    const candidates = selector.selectCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.safeUrl).toBe("https://secondary.test");
  });

  it("recovers an unhealthy endpoint into rotation only after probes restore it", async () => {
    let primaryHealthy = false;
    const transports: Record<string, StellarRpcTransport> = {
      "https://primary.test": {
        ...mockTransport({ ledger: 1000 }),
        async getHealth() {
          return { status: primaryHealthy ? "healthy" : "unhealthy" };
        },
      },
      "https://secondary.test": mockTransport({ ledger: 1000 }),
    };

    const scheduler = new ProbeScheduler({
      endpoints: ["https://primary.test", "https://secondary.test"],
      transportFactory: (url) => transports[url]!,
      expectedPassphrase: "Test SDF Network ; September 2015",
      expectedProtocolVersion: 22,
    });

    await scheduler.probeAll();
    const selector = new EndpointSelector(scheduler);

    expect(selector.selectCandidates().map((c) => c.safeUrl)).toEqual([
      "https://secondary.test",
    ]);

    primaryHealthy = true;
    await scheduler.probeEndpoint("https://primary.test", true);
    await scheduler.probeEndpoint("https://primary.test", true);

    const restoredCandidates = selector.selectCandidates().map((c) => c.safeUrl);
    expect(restoredCandidates).toContain("https://primary.test");
  });
});
