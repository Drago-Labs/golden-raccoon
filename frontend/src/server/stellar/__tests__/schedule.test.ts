import { describe, expect, it } from "vitest";
import { ProbeScheduler } from "../probes/schedule";
import type { StellarRpcTransport } from "../dataLayer";

function mockTransport(): StellarRpcTransport {
  return {
    async getHealth() {
      return { status: "healthy" };
    },
    async getNetwork() {
      return {
        passphrase: "Test SDF Network ; September 2015",
        protocolVersion: 22,
      };
    },
    async getLatestLedger() {
      return { sequence: 1000 };
    },
    async getLedgerEntries(): Promise<ReturnType<StellarRpcTransport["getLedgerEntries"]>> {
      return { entries: [], latestLedger: 1000 } as unknown as ReturnType<StellarRpcTransport["getLedgerEntries"]>;
    },
    async simulateTransaction(): Promise<ReturnType<StellarRpcTransport["simulateTransaction"]>> {
      return {} as unknown as ReturnType<StellarRpcTransport["simulateTransaction"]>;
    },
    async sendTransaction(): Promise<ReturnType<StellarRpcTransport["sendTransaction"]>> {
      return {} as unknown as ReturnType<StellarRpcTransport["sendTransaction"]>;
    },
    async getTransaction(): Promise<ReturnType<StellarRpcTransport["getTransaction"]>> {
      return {} as unknown as ReturnType<StellarRpcTransport["getTransaction"]>;
    },
    async getEvents(): Promise<ReturnType<StellarRpcTransport["getEvents"]>> {
      return {} as unknown as ReturnType<StellarRpcTransport["getEvents"]>;
    },
  };
}

describe("ProbeScheduler Bounded Quota & History", () => {
  it("bounds probe frequency with minIntervalMs to avoid exhausting provider quota", async () => {
    let probeCalls = 0;
    let clock = 1000;

    const transport: StellarRpcTransport = {
      ...mockTransport(),
      async getHealth() {
        probeCalls += 1;
        return { status: "healthy" };
      },
    };

    const scheduler = new ProbeScheduler({
      endpoints: ["https://rpc1.test"],
      transportFactory: () => transport,
      minIntervalMs: 5000,
      now: () => clock,
    });

    await scheduler.probeAll();
    expect(probeCalls).toBe(1);

    clock = 2000;
    await scheduler.probeAll();
    expect(probeCalls).toBe(1);

    clock = 5999;
    await scheduler.probeAll();
    expect(probeCalls).toBe(1);

    clock = 6001;
    await scheduler.probeAll();
    expect(probeCalls).toBe(2);
  });

  it("limits sample history to prevent memory leak over long runtimes", () => {
    const scheduler = new ProbeScheduler({
      endpoints: ["https://rpc1.test"],
      transportFactory: () => mockTransport(),
      sampleHistoryLimit: 5,
    });

    for (let i = 0; i < 20; i += 1) {
      scheduler.recordOutcome("https://rpc1.test", {
        ok: true,
        latencyMs: 100,
        ledgerHeight: 1000 + i,
      });
    }

    const state = scheduler.getState("https://rpc1.test");
    expect(state?.samples.length).toBe(5);
    expect(state?.ledgerHeight).toBe(1019);
  });
});
