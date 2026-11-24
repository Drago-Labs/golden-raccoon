import { describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_LIMITS,
  AttributionError,
  attributePerformance,
  type AttributionDeps,
} from "@/server/research/performance-attribution";
import { periodNotes, reportCoverage } from "@/server/research/performance-attribution/coverage";
import { attributionRequest, FOREIGN_WALLET, normalized, observations, recordedHistory, WETH } from "./fixtures";

function deps(name: Parameters<typeof recordedHistory>[0], extra: Partial<AttributionDeps> = {}): AttributionDeps {
  return { readHistory: recordedHistory(name), ...extra };
}

describe("attributePerformance: input", () => {
  it("rejects a malformed request with a typed error", async () => {
    await expect(attributePerformance({}, deps("steadyPortfolio"))).rejects.toBeInstanceOf(AttributionError);
    await expect(
      attributePerformance(attributionRequest("steadyPortfolio", { windowEnd: "2026-11-17T00:00:00.000Z" }), deps("steadyPortfolio")),
    ).rejects.toThrowError(/request is invalid/);
  });

  it("rejects a wallet whose family does not match the network", async () => {
    await expect(
      attributePerformance(attributionRequest("steadyPortfolio", { network: "stellar-pubnet" }), deps("steadyPortfolio")),
    ).rejects.toThrowError(/request is invalid/);
  });

  it("refuses observations recorded for another portfolio", async () => {
    const mixed = observations("steadyPortfolio").map((row, index) =>
      index === 1 ? { ...row, walletAddress: FOREIGN_WALLET } : row,
    );
    await expect(
      attributePerformance(attributionRequest("steadyPortfolio", { snapshots: mixed }), deps("steadyPortfolio")),
    ).rejects.toThrowError(/another wallet or network/);
  });
});

describe("attributePerformance: the steady recorded portfolio", () => {
  it("attributes each day's change to the market with no flows", async () => {
    const result = await attributePerformance(attributionRequest("steadyPortfolio"), deps("steadyPortfolio"));
    expect(result.state).toBe("ready");
    const report = result.report;
    expect(report.state).toBe("complete");
    expect(report.periods.map((period) => [period.label, period.changeUsd, period.externalFlowUsd, period.marketUsd])).toEqual([
      ["2026-11-18", "2000", "0", "2000"],
      ["2026-11-19", "-1000", "0", "-1000"],
    ]);
    expect(report.totals).toMatchObject({
      changeUsd: "1000",
      externalFlowUsd: "0",
      marketUsd: "1000",
      priceEffectUsd: "1000",
      residualUsd: "0",
      attributedPeriods: 2,
      unavailablePeriods: 0,
    });
    expect(report.readOnly).toBe(true);
  });

  it("states each asset's and chain's contribution", async () => {
    const result = await attributePerformance(attributionRequest("steadyPortfolio"), deps("steadyPortfolio"));
    const [first] = result.report.periods;
    expect(first.assets.find((asset) => asset.key === WETH)).toMatchObject({
      marketUsd: "2000",
      priceEffectUsd: "2000",
      marketShareBps: "10000",
      state: "complete",
    });
    expect(first.chains).toEqual([
      expect.objectContaining({ chain: "ethereum", marketUsd: "2000", state: "complete" }),
    ]);
  });
});

describe("attributePerformance: a deposit is never a return", () => {
  it("subtracts the recorded transfer before attributing anything to the market", async () => {
    const result = await attributePerformance(attributionRequest("largeDeposit"), deps("largeDeposit"));
    const [period] = result.report.periods;
    expect(period).toMatchObject({
      changeUsd: "11500",
      externalFlowUsd: "10000",
      marketUsd: "1500",
      priceEffectUsd: "1000",
      residualUsd: "500",
      flowCount: 1,
    });
    // Flow + price effect + residual is exactly the observed change.
    expect(Number(period.externalFlowUsd) + Number(period.priceEffectUsd) + Number(period.residualUsd)).toBe(
      Number(period.changeUsd),
    );
  });

  it("counts neither a swap nor an unsettled transfer as a flow", async () => {
    const result = await attributePerformance(attributionRequest("steadyPortfolio"), deps("steadyPortfolio"));
    expect(result.report.periods.every((period) => period.externalFlowUsd === "0" && period.flowCount === 0)).toBe(true);
  });
});

describe("attributePerformance: incomplete evidence", () => {
  it("labels a period with no bounding observation instead of filling it", async () => {
    const result = await attributePerformance(attributionRequest("missingPrices"), deps("missingPrices"));
    expect(result.state).toBe("ready");
    const labels = result.report.periods.map((period) => [period.label, period.state]);
    expect(labels).toEqual([
      ["2026-11-18", "partial"],
      ["2026-11-19", "unavailable"],
      ["2026-11-20", "unavailable"],
    ]);
    const unavailable = result.report.periods[1];
    expect(unavailable.changeUsd).toBeNull();
    expect(unavailable.notes.join(" ")).toMatch(/No recorded observation inside this period/);
    expect(result.report.totals.unavailablePeriods).toBe(2);
    expect(result.report.coverage.join(" ")).toMatch(/reported as unavailable rather than filled: 2026-11-19, 2026-11-20/);
  });

  it("keeps an unpriced asset out of the totals rather than counting it as zero", async () => {
    const result = await attributePerformance(attributionRequest("missingPrices"), deps("missingPrices"));
    const [first] = result.report.periods;
    expect(first.state).toBe("partial");
    expect(first.changeUsd).toBeNull();
    expect(first.assets.find((asset) => asset.key === WETH)).toMatchObject({ marketUsd: "1000", state: "complete" });
    expect(first.notes.join(" ")).toMatch(/no usable price/i);
  });

  it("reports the whole window as unavailable when flows cannot be read", async () => {
    const result = await attributePerformance(attributionRequest("providerUnavailable"), deps("providerUnavailable"));
    expect(result.state).toBe("unavailable");
    expect(result).toMatchObject({ reason: expect.stringMatching(/External flows could not be read/) });
    expect(result.report.periods.every((period) => period.state === "unavailable")).toBe(true);
    expect(result.report.totals.marketUsd).toBeNull();
  });

  it("falls back to the recorded observations when the live read fails", async () => {
    const result = await attributePerformance(
      attributionRequest("steadyPortfolio", { includeLiveSnapshot: true }),
      deps("steadyPortfolio", {
        readLivePortfolio: async () => {
          throw new AttributionError("provider_unavailable", "The portfolio read API returned no usable portfolio.");
        },
      }),
    );
    expect(result.state).toBe("ready");
    expect(result.report.coverage.join(" ")).toMatch(/live portfolio could not be read/);
  });

  it("uses the live read as one more observation when it succeeds", async () => {
    const live = { ...observations("steadyPortfolio")[2], at: "2026-11-20T00:30:00.000Z", source: "Live portfolio read API" };
    const readLivePortfolio = vi.fn(async () => live);
    const result = await attributePerformance(
      attributionRequest("steadyPortfolio", { includeLiveSnapshot: true, windowEnd: "2026-11-20T12:00:00.000Z" }),
      deps("steadyPortfolio", { readLivePortfolio }),
    );
    expect(readLivePortfolio).toHaveBeenCalled();
    // The live read is the only observation inside the last period, so it bounds it.
    const last = result.report.periods[result.report.periods.length - 1];
    expect(last.endObservedAt).toBe("2026-11-20T00:30:00.000Z");
  });

  it("refuses to pretend a live read happened when no reader is configured", async () => {
    await expect(
      attributePerformance(attributionRequest("steadyPortfolio", { includeLiveSnapshot: true }), deps("steadyPortfolio")),
    ).rejects.toThrowError(/No live portfolio reader/);
  });

  it("never returns anything a caller could submit", async () => {
    const result = await attributePerformance(attributionRequest("largeDeposit"), deps("largeDeposit"));
    expect(JSON.stringify(result)).not.toMatch(/signature|signedTx|xdr|calldata|privateKey/i);
  });
});

describe("coverage notes", () => {
  it("explains an unbounded period without carrying a neighbour's value", () => {
    expect(periodNotes(null, null, false).state).toBe("unavailable");
    expect(periodNotes(null, null, false).notes.join(" ")).toMatch(/No value was carried over/);
    expect(periodNotes(normalized("steadyPortfolio")[0], null, false).notes.join(" ")).toMatch(/No recorded observation inside/);
  });

  it("marks a period partial when a price or an asset is missing", () => {
    const missing = normalized("missingPrices");
    expect(periodNotes(missing[0], missing[1], false).state).toBe("partial");
    expect(periodNotes(normalized("steadyPortfolio")[0], normalized("steadyPortfolio")[1], true).state).toBe("partial");
    expect(periodNotes(normalized("steadyPortfolio")[0], normalized("steadyPortfolio")[1], false).state).toBe("complete");
  });

  it("states the method, the evidence used and that this is not advice", () => {
    const notes = reportCoverage([], normalized("steadyPortfolio"), { count: 2, truncated: true }).join(" ");
    expect(notes).toMatch(/no value is interpolated/);
    expect(notes).toMatch(/a deposit is never a gain/);
    expect(notes).toMatch(/3 recorded observation\(s\) and 2 external flow\(s\)/);
    expect(notes).toMatch(/filled this reader's page budget/);
    expect(notes).toMatch(/not tax reporting and not advice/);
  });
});

describe("the public entry point", () => {
  it("publishes the documented bounds and a typed error", () => {
    expect(ATTRIBUTION_LIMITS).toMatchObject({ maxWindowDays: 370, maxPeriods: 120, maxSnapshots: 400, usdDecimals: 8 });
    const error = new AttributionError("identity_mismatch", "nope");
    expect([error.name, error.code]).toEqual(["AttributionError", "identity_mismatch"]);
  });
});
