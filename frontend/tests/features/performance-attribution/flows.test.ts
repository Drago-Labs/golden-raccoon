import { describe, expect, it, vi } from "vitest";
import { parseUsd } from "@/server/research/performance-attribution/decimalMath";
import { AttributionError } from "@/server/research/performance-attribution/errors";
import { normalizeFlow, readExternalFlows } from "@/server/research/performance-attribution/flowReader";
import { closingPeriod, separateFlows } from "@/server/research/performance-attribution/flowSeparation";
import { buildPeriods, resolveWindow } from "@/server/research/performance-attribution/periods";
import { fixture, recordedHistory, scope, WALLET } from "./fixtures";

const window = resolveWindow("2026-11-18T00:00:00.000Z", "2026-11-20T00:00:00.000Z");

describe("readExternalFlows", () => {
  it("reads a settled transfer as an external flow", async () => {
    const read = recordedHistory("largeDeposit");
    const result = await readExternalFlows(read, scope, window);
    expect(result.truncated).toBe(false);
    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]).toMatchObject({
      at: "2026-11-18T12:00:00.000Z",
      key: "ethereum:weth",
      direction: "deposit",
      valueUsdUnits: parseUsd("10000"),
      source: "transaction-history read API",
    });
    expect(read).toHaveBeenCalledWith({ walletAddress: WALLET, cursor: undefined, limit: 200 });
  });

  it("counts neither a swap nor an unsettled transfer as an external flow", async () => {
    const result = await readExternalFlows(recordedHistory("steadyPortfolio"), scope, window);
    // The recorded page holds one swap and one submitted transfer.
    expect(fixture("steadyPortfolio").history.items).toHaveLength(2);
    expect(result.flows).toEqual([]);
  });

  it("ignores a record of another wallet, network or time", async () => {
    const [record] = fixture("largeDeposit").history.items as Array<Record<string, unknown>>;
    const read = vi.fn(async () => ({
      items: [
        { ...record, walletAddress: "0x5555555555555555555555555555555555555555" },
        { ...record, network: "base" },
        { ...record, createdAt: "2026-10-01T00:00:00.000Z" },
      ],
      nextCursor: null,
    }));
    const result = await readExternalFlows(read, scope, window);
    expect(result.flows).toEqual([]);
  });

  it("reports a transfer with no recorded USD value instead of treating it as zero", async () => {
    const [record] = fixture("largeDeposit").history.items as Array<Record<string, unknown>>;
    const read = vi.fn(async () => ({ items: [{ ...record, valueUsd: null }], nextCursor: null }));
    await expect(readExternalFlows(read, scope, window)).rejects.toThrowError(/no recorded USD value/);
  });

  it("raises the provider's own failure when the read API returns no items", async () => {
    await expect(readExternalFlows(recordedHistory("providerUnavailable"), scope, window)).rejects.toThrowError(
      AttributionError,
    );
  });

  it("pages under the documented budget and reports truncation", async () => {
    const [record] = fixture("largeDeposit").history.items as Array<Record<string, unknown>>;
    const read = vi.fn(async ({ cursor }: { cursor?: string }) => ({
      items: [{ ...record, hash: `0x${(cursor ?? "0").padStart(64, "0")}` }],
      nextCursor: `${Number(cursor ?? 0) + 1}`,
    }));
    const result = await readExternalFlows(read, scope, window);
    expect(read).toHaveBeenCalledTimes(5);
    expect(result.truncated).toBe(true);
  });
});

describe("normalizeFlow", () => {
  it("signs a withdrawal negative however the provider stated it", () => {
    const base = {
      id: "0xabc",
      at: "2026-11-18T12:00:00.000Z",
      key: "ethereum:weth",
      symbol: "WETH",
      chain: "ethereum",
      quantity: null,
      source: "fixture",
      txId: "0xabc",
    };
    expect(normalizeFlow({ ...base, valueUsd: "100", direction: "withdrawal" }).valueUsdUnits).toBe(parseUsd("-100"));
    expect(normalizeFlow({ ...base, valueUsd: "-100", direction: "withdrawal" }).valueUsdUnits).toBe(parseUsd("-100"));
    expect(normalizeFlow({ ...base, valueUsd: "100", direction: "deposit" }).valueUsdUnits).toBe(parseUsd("100"));
  });

  it("refuses a malformed record", () => {
    expect(() => normalizeFlow({ id: "x" })).toThrowError(/malformed/);
  });
});

describe("separateFlows", () => {
  const periods = buildPeriods(window, "day");

  it("assigns a flow to the period it falls in, and a boundary flow to the period that starts there", async () => {
    const { flows } = await readExternalFlows(recordedHistory("largeDeposit"), scope, window);
    const boundary = [...flows, { ...flows[0], id: "boundary", at: "2026-11-19T00:00:00.000Z" }];
    expect(separateFlows(periods[0], boundary).flows.map((flow) => flow.id)).toEqual([flows[0].id]);
    expect(separateFlows(periods[1], boundary).flows.map((flow) => flow.id)).toEqual(["boundary"]);
  });

  it("nets flows per asset, per chain and for the period", async () => {
    const { flows } = await readExternalFlows(recordedHistory("largeDeposit"), scope, window);
    const withWithdrawal = [
      ...flows,
      { ...flows[0], id: "out", direction: "withdrawal" as const, valueUsdUnits: parseUsd("-2500") },
    ];
    const separated = separateFlows(periods[0], withWithdrawal);
    expect(separated.total).toBe(parseUsd("7500"));
    expect(separated.byAsset.get("ethereum:weth")).toBe(parseUsd("7500"));
    expect(separated.byChain.get("ethereum")).toBe(parseUsd("7500"));
  });

  it("counts a flow exactly at the end of the window in the closing period", async () => {
    const { flows } = await readExternalFlows(recordedHistory("largeDeposit"), scope, window);
    const atEnd = [{ ...flows[0], id: "closing", at: window.end }];
    const last = periods[periods.length - 1];
    expect(separateFlows(last, atEnd).flows).toHaveLength(0);
    expect(separateFlows(closingPeriod(last, window.end), atEnd).flows.map((flow) => flow.id)).toEqual(["closing"]);
  });

  it("leaves a period with no flow at zero rather than unavailable", () => {
    const separated = separateFlows(periods[0], []);
    expect(separated.total).toBe(0n);
    expect(separated.byAsset.size).toBe(0);
  });
});
