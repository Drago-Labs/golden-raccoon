import { describe, expect, it } from "vitest";
import { formatPrice, parsePrice } from "@/server/research/liquidity-depth/amountMath";
import { LiquidityError } from "@/server/research/liquidity-depth/schema";
import { analyseLiquidity } from "@/server/research/liquidity-depth/service";
import {
  constantProductFeeAndRounding,
  crossedBook,
  emptyBook,
  orderbookMultipleLevels,
  sameSymbolTwoNetworks,
  staleTruncatedUnsupported,
  zeroReservePool,
} from "./fixtures";

describe("order-book depth", () => {
  it("matches the hand-calculated fill across multiple levels", () => {
    const report = analyseLiquidity(orderbookMultipleLevels);
    const venue = report.venues[0];
    // 150 XLM: 100 @ 0.50 = 50 USDC, 50 @ 0.49 = 24.5 USDC -> 74.5 USDC.
    const rung = venue.ladder.find((entry) => entry.requestedBaseAmount === "1500000000");

    expect(rung?.status).toBe("filled");
    expect(rung?.fillableBaseAmount).toBe("1500000000");
    expect(rung?.quoteAmount).toBe("745000000");
  });

  it("matches the hand-calculated effective price and impact", () => {
    const report = analyseLiquidity(orderbookMultipleLevels);
    const rung = report.venues[0].ladder.find((entry) => entry.requestedBaseAmount === "1500000000");

    // 74.5 / 150 = 0.4966666666666666666…
    expect(rung?.effectivePrice).toBe("0.496666666666666666");
    // (0.50 - 0.496666…) / 0.50 = 0.006666… -> 66 bps after truncation.
    expect(rung?.priceImpactBps).toBe(66);
  });

  it("builds a cumulative depth curve over the observed levels only", () => {
    const report = analyseLiquidity(orderbookMultipleLevels);
    const levels = report.venues[0].levels;

    expect(levels).toHaveLength(3);
    expect(levels[0].cumulativeBaseAmount).toBe("1000000000");
    expect(levels[1].cumulativeBaseAmount).toBe("2000000000");
    // 50 + 49 = 99 USDC after two levels.
    expect(levels[1].cumulativeQuoteAmount).toBe("990000000");
    expect(report.venues[0].visibleBaseDepth).toBe("3000000000");
  });

  it("reports a size beyond the book as partial rather than clamping it", () => {
    const report = analyseLiquidity(orderbookMultipleLevels);
    const rung = report.venues[0].ladder.find((entry) => entry.requestedBaseAmount === "5000000000");

    expect(rung?.status).toBe("partial");
    expect(rung?.fillableBaseAmount).toBe("3000000000");
    expect(rung?.note).toMatch(/depth this snapshot does not show/i);
  });
});

describe("constant-product depth", () => {
  it("matches the hand-calculated fee-adjusted output", () => {
    const report = analyseLiquidity(constantProductFeeAndRounding);
    const rung = report.venues[0].ladder.find((entry) => entry.requestedBaseAmount === "1000000000000000000");

    // dy = 3e12 * 997e15 / (1000e18 + 997e15) = 2_988_020_943 (2988.020943 USDC).
    expect(rung?.quoteAmount).toBe("2988020943");
    expect(rung?.status).toBe("filled");
    expect(rung?.feeBps).toBe(30);
  });

  it("keeps 18-decimal precision through the calculation", () => {
    const report = analyseLiquidity(constantProductFeeAndRounding);
    const rung = report.venues[0].ladder.find((entry) => entry.requestedBaseAmount === "10000000000000000000");

    // dx_net = 10e18 * 9970/10000 = 9_970_000_000_000_000_000
    // dy = 3e12 * 9.97e18 / (1e21 + 9.97e18) = 29_614_741_031, every digit kept.
    expect(rung?.quoteAmount).toBe("29614741031");
  });

  it("labels pool figures as modelled rather than observed", () => {
    const report = analyseLiquidity(constantProductFeeAndRounding);

    expect(report.venues[0].assumptions.join(" ")).toMatch(/modelled figures, not observed orders/i);
    expect(report.venues[0].ladder[0].note).toMatch(/model of the curve, not an observed order/i);
  });

  it("reports price impact against the pool spot price", () => {
    const report = analyseLiquidity(constantProductFeeAndRounding);
    const small = report.venues[0].ladder[0];
    const large = report.venues[0].ladder[1];

    expect(small.priceImpactBps).toBeGreaterThan(0);
    expect(large.priceImpactBps!).toBeGreaterThan(small.priceImpactBps!);
  });
});

describe("snapshots that cannot produce an unqualified result", () => {
  it("refuses a crossed book", () => {
    const report = analyseLiquidity(crossedBook);

    expect(report.venues[0].state).toBe("unavailable");
    expect(report.venues[0].qualifications.join(" ")).toMatch(/crossed book/i);
    expect(report.venues[0].ladder[0].status).toBe("not_modelled");
  });

  it("refuses a pool with a zero reserve", () => {
    const report = analyseLiquidity(zeroReservePool);

    expect(report.venues[0].state).toBe("unavailable");
    expect(report.venues[0].qualifications.join(" ")).toMatch(/zero reserve/i);
  });

  it("qualifies a stale snapshot instead of using it silently", () => {
    const report = analyseLiquidity(staleTruncatedUnsupported);
    const stale = report.venues.find((venue) => venue.venue.venueId === "stale-book");

    expect(stale?.qualifications.join(" ")).toMatch(/freshness bound/i);
    expect(stale?.state).toBe("partial");
  });

  it("says a truncated source hides depth rather than lacking it", () => {
    const report = analyseLiquidity(staleTruncatedUnsupported);
    const stale = report.venues.find((venue) => venue.venue.venueId === "stale-book");

    expect(stale?.qualifications.join(" ")).toMatch(/unknown, not absent/i);
  });

  it("shows an unsupported model honestly instead of approximating it", () => {
    const report = analyseLiquidity(staleTruncatedUnsupported);
    const exotic = report.venues.find((venue) => venue.venue.venueId === "exotic-amm");

    expect(exotic?.state).toBe("unavailable");
    expect(exotic?.ladder[0].status).toBe("not_modelled");
    expect(exotic?.visibleBaseDepth).toBe("0");
  });

  it("reports an empty taker side as unavailable, not as zero-cost", () => {
    const report = analyseLiquidity(emptyBook);

    expect(report.venues[0].state).toBe("unavailable");
    expect(report.venues[0].ladder[0].status).toBe("insufficient_depth");
    expect(report.venues[0].ladder[0].quoteAmount).toBeNull();
  });
});

describe("identity and precision", () => {
  it("keeps the same symbol on different networks as distinct identities", () => {
    const report = analyseLiquidity(sameSymbolTwoNetworks);
    const keys = report.venues.map((venue) => venue.venue.base.identityKey);

    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toContain("stellar-pubnet");
    expect(keys[1]).toContain("ethereum");
  });

  it("preserves each asset's declared precision", () => {
    const report = analyseLiquidity(sameSymbolTwoNetworks);

    expect(report.venues[0].venue.base.decimals).toBe(7);
    expect(report.venues[1].venue.base.decimals).toBe(6);
    expect(report.venues[1].venue.quote.decimals).toBe(18);
  });

  it("round-trips a decimal price without float drift", () => {
    expect(formatPrice(parsePrice("0.000000000000000001"))).toBe("0.000000000000000001");
    expect(formatPrice(parsePrice("123456789.123456789"))).toBe("123456789.123456789");
  });

  it("truncates a price beyond the supported scale rather than rounding up", () => {
    // Rounding up would let the report claim depth at a price never offered.
    expect(formatPrice(parsePrice("0.9999999999999999999"))).toBe("0.999999999999999999");
  });
});

describe("coverage", () => {
  it("distinguishes complete, partial and empty states", () => {
    expect(analyseLiquidity(orderbookMultipleLevels).coverage.state).toBe("complete");
    expect(analyseLiquidity(staleTruncatedUnsupported).coverage.state).toBe("partial");
  });

  it("counts stale, truncated and unsupported venues separately", () => {
    const coverage = analyseLiquidity(staleTruncatedUnsupported).coverage;

    expect(coverage.venueCount).toBe(2);
    expect(coverage.staleVenueCount).toBe(1);
    expect(coverage.truncatedVenueCount).toBe(1);
    expect(coverage.unsupportedVenueCount).toBe(1);
    expect(coverage.note).toMatch(/partial/i);
  });
});

describe("informational guarantee", () => {
  it("carries the informational-only marker in the payload", () => {
    expect(analyseLiquidity(orderbookMultipleLevels).informationalOnly).toBe(true);
  });

  it("never emits a field an executor could act on", () => {
    const report = analyseLiquidity(orderbookMultipleLevels);
    const keys = new Set<string>();

    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key.toLowerCase());
          walk(child);
        }
      }
    };

    walk(report);

    // Prose may mention routing to say none is performed; a *field* carrying an
    // executable artifact is what must never exist.
    for (const forbidden of ["route", "routes", "calldata", "xdr", "envelope", "transaction", "signature", "deadline", "slippagetolerance", "minamountout"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(orderbookMultipleLevels);
    analyseLiquidity(orderbookMultipleLevels);
    expect(JSON.stringify(orderbookMultipleLevels)).toBe(before);
  });
});

describe("validation", () => {
  it("rejects a ladder that is not strictly ascending", () => {
    expect(() => analyseLiquidity({ ...orderbookMultipleLevels, ladder: ["100", "100"] })).toThrow(LiquidityError);
  });

  it("rejects a non-integer amount", () => {
    expect(() => analyseLiquidity({ ...orderbookMultipleLevels, ladder: ["1.5"] })).toThrow(LiquidityError);
  });

  it("rejects a request with no venue", () => {
    expect(() => analyseLiquidity({ ...orderbookMultipleLevels, venues: [] })).toThrow(LiquidityError);
  });
});
