import { describe, expect, it } from "vitest";
import { analyseOracleDivergence } from "@/server/research/oracle-divergence";
import { parseDecimalPrice, scaleRawAnswer, spreadBps } from "@/server/research/oracle-divergence/priceMath";
import { baseRequest, chainlinkFeed, ethUsdPair, quote, round } from "./fixtures";

describe("oracle divergence analysis", () => {
  it("computes a decimal-safe spread for an 8-decimal feed against a market quote", () => {
    const report = analyseOracleDivergence(baseRequest());
    const comparison = report.pairs[0].comparisons[0];
    const expectedOracle = scaleRawAnswer("180000000000", 8);
    const expectedSpread = spreadBps(parseDecimalPrice("1801.10"), expectedOracle);
    expect(comparison.state).toBe("compared");
    expect(comparison.spreadBps).toBe(expectedSpread);
    expect(comparison.oraclePrice).toBe("1800");
  });

  it("gives the same spread magnitude regardless of the feed's decimals, given an equivalent raw answer", () => {
    const eightDecimals = analyseOracleDivergence(baseRequest());
    const eighteenDecimals = analyseOracleDivergence(
      baseRequest({
        feeds: [chainlinkFeed({ decimals: 18 })],
        rounds: [round({ rawAnswer: "1800000000000000000000" })],
      }),
    );
    expect(eighteenDecimals.pairs[0].comparisons[0].oraclePrice).toBe(eightDecimals.pairs[0].comparisons[0].oraclePrice);
    expect(eighteenDecimals.pairs[0].comparisons[0].spreadBps).toBe(eightDecimals.pairs[0].comparisons[0].spreadBps);
  });

  it("inverts a feed reported quote-per-base before comparing", () => {
    // ~1 / 1800 ETH-per-USD, scaled by 1e8: 55556 (truncated).
    const invertedRawAnswer = "55556";
    const report = analyseOracleDivergence(
      baseRequest({
        feeds: [chainlinkFeed({ inverted: true, decimals: 8 })],
        rounds: [round({ rawAnswer: invertedRawAnswer })],
      }),
    );
    const comparison = report.pairs[0].comparisons[0];
    expect(comparison.state).toBe("compared");
    // Inverting ~1/1800 back should land close to 1800, not near zero.
    expect(Number(comparison.oraclePrice)).toBeGreaterThan(1700);
    expect(Number(comparison.oraclePrice)).toBeLessThan(1900);
  });

  it("marks a round older than the staleness bound as stale rather than comparing it", () => {
    const report = analyseOracleDivergence(
      baseRequest({
        rounds: [round({ updatedAt: "2025-12-01T00:00:00Z" })],
      }),
    );
    const comparison = report.pairs[0].comparisons[0];
    expect(comparison.state).toBe("stale_feed");
    expect(comparison.spreadBps).toBeNull();
  });

  it("never invents a round for a quote before any round exists", () => {
    const report = analyseOracleDivergence(
      baseRequest({
        windowStart: "2025-12-31T22:00:00Z",
        quotes: [quote({ observedAt: "2025-12-31T23:00:00Z" })],
      }),
    );
    expect(report.pairs[0].comparisons[0].state).toBe("missing_feed");
  });

  it("excludes a feed or quote referencing an undeclared pair rather than guessing a mapping", () => {
    const report = analyseOracleDivergence(
      baseRequest({
        feeds: [chainlinkFeed(), chainlinkFeed({ feedId: "orphan-feed", pairId: "btc-usd" })],
        quotes: [quote(), quote({ pairId: "sol-usd" })],
      }),
    );
    expect(report.unmappedFeedIds).toEqual(["orphan-feed"]);
    expect(report.unmappedQuotePairIds).toEqual(["sol-usd"]);
    expect(report.pairs[0].comparisons).toHaveLength(1);
  });

  it("reports a paused feed distinctly from a missing or stale one", () => {
    const report = analyseOracleDivergence(baseRequest({ feeds: [chainlinkFeed({ paused: true })] }));
    expect(report.pairs[0].comparisons[0].state).toBe("paused_feed");
  });

  it("surfaces an outlier quote in the max-absolute-spread summary without hiding it", () => {
    const report = analyseOracleDivergence(
      baseRequest({
        quotes: [quote({ observedAt: "2026-01-01T00:01:00Z", price: "1800.00" }), quote({ observedAt: "2026-01-01T00:02:00Z", price: "5000.00", sourceLabel: "Outlier venue" })],
      }),
    );
    const summary = report.pairs[0].feedSummaries[0];
    expect(summary.comparedCount).toBe(2);
    expect(summary.maxAbsSpreadBps).toBeGreaterThan(50_00);
  });

  it("rejects a window whose end precedes its start", () => {
    expect(() => analyseOracleDivergence(baseRequest({ windowEnd: "2025-01-01T00:00:00Z" }))).toThrow();
  });

  it.each([ethUsdPair])("keeps every declared pair even with zero quotes in the window", (pair) => {
    const report = analyseOracleDivergence(baseRequest({ quotes: [] }));
    expect(report.pairs[0].pair).toEqual(pair);
    expect(report.pairs[0].comparisons).toHaveLength(0);
  });
});
