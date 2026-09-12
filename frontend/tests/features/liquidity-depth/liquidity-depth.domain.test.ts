import { describe, it, expect } from "vitest";
import {
  parseDecimalToBigInt,
  formatBigIntToDecimal,
  mulDivBigInt,
  calculatePriceImpactPercent,
  applyFeeBps,
  normalizeAssetAmount,
  isOrderbookCrossed,
  buildDepthCurve,
  calculateOrderbookStep,
  calculateConstantProductStep,
  buildSizeLadder,
  calculateOrderbookCapacity,
  calculateConstantProductCapacity,
  calculateCapacity,
  evaluateCoverage,
  getLiquidityDepth,
} from "@/server/research/liquidity-depth";
import {
  validOrderbookFixture,
  crossedOrderbookFixture,
  emptyOrderbookFixture,
  staleOrderbookFixture,
  truncatedOrderbookFixture,
  validConstantProductFixture,
  zeroReservePoolFixture,
  sameAssetFixture,
  unsupportedPoolFixture,
} from "./fixtures";

describe("Amount Math & Precision", () => {
  it("converts decimal strings to BigInt and formats back without drift", () => {
    const raw = "123.4567890";
    const parsed = parseDecimalToBigInt(raw, 7);
    expect(parsed).toBe(1234567890n);

    const formatted = formatBigIntToDecimal(parsed, 7);
    expect(formatted).toBe("123.4567890");
  });

  it("handles 18-decimal EVM asset values accurately", () => {
    const raw = "1.500000000000000000";
    const parsed = parseDecimalToBigInt(raw, 18);
    expect(parsed).toBe(1500000000000000000n);

    const formatted = formatBigIntToDecimal(parsed, 18);
    expect(formatted).toBe("1.500000000000000000");
  });

  it("multiplies and divides with mulDivBigInt maintaining scale", () => {
    const a = 1000000000n;
    const b = 2000000000n;
    const denominator = 1000000000n;
    const result = mulDivBigInt(a, b, denominator);
    expect(result).toBe(2000000000n);
  });

  it("calculates price impact percent correctly", () => {
    const impact = calculatePriceImpactPercent(98, 100);
    expect(impact).toBeCloseTo(2.0, 3);

    const zeroImpact = calculatePriceImpactPercent(100, 100);
    expect(zeroImpact).toBe(0);
  });

  it("deducts fee bps accurately", () => {
    const amount = 10_000n;
    const net = applyFeeBps(amount, 30);
    expect(net).toBe(9970n);
  });

  it("normalizes asset amount into human-readable number", () => {
    const normalized = normalizeAssetAmount(15_000_000n, 6);
    expect(Number(normalized.normalizedDecimal)).toBe(15);
    expect(normalized.rawBigInt).toBe(15_000_000n);
  });
});

describe("Order Book Walking & Depth Curves", () => {
  it("detects crossed books correctly", () => {
    expect(isOrderbookCrossed(validOrderbookFixture.orderbook!)).toBe(false);
    expect(isOrderbookCrossed(crossedOrderbookFixture.orderbook!)).toBe(true);
  });

  it("computes mid price, spread and depth thresholds from order book", () => {
    const curve = buildDepthCurve(validOrderbookFixture);

    expect(curve.midPrice).toBeCloseTo(0.121, 5);
    expect(curve.spreadPercent).toBeDefined();
    expect(curve.spreadPercent!).toBeGreaterThan(0);

    expect(curve.bids.length).toBe(4);
    expect(curve.asks.length).toBe(4);

    expect(curve.bids[0].cumulativeBase).toBe(1000);
    expect(curve.bids[1].cumulativeBase).toBe(3000);
    expect(curve.bids[2].cumulativeBase).toBe(8000);
    expect(curve.bids[3].cumulativeBase).toBe(18000);

    expect(curve.asks[0].cumulativeBase).toBe(1000);
    expect(curve.asks[1].cumulativeBase).toBe(3000);
    expect(curve.asks[2].cumulativeBase).toBe(8000);
    expect(curve.asks[3].cumulativeBase).toBe(18000);

    expect(curve.depthAt1Pct).toBeDefined();
    expect(curve.depthAt2Pct).toBeDefined();
    expect(curve.depthAt5Pct).toBeDefined();
    expect(curve.depthAt10Pct).toBeDefined();
  });

  it("returns zero midPrice and empty curves for empty order books", () => {
    const curve = buildDepthCurve(emptyOrderbookFixture);
    expect(curve.midPrice).toBe(0);
    expect(curve.bids).toHaveLength(0);
    expect(curve.asks).toHaveLength(0);
  });
});

describe("Constant-Product AMM Curves", () => {
  it("generates analytical curves for constant product pools", () => {
    const curve = buildDepthCurve(validConstantProductFixture);

    expect(curve.midPrice).toBe(2000);
    expect(curve.spreadPercent).toBeCloseTo(0.3, 2);
    expect(curve.bids.length).toBeGreaterThan(5);
    expect(curve.asks.length).toBeGreaterThan(5);

    expect(curve.depthAt1Pct).toBeGreaterThan(0);
    expect(curve.depthAt2Pct).toBeGreaterThan(curve.depthAt1Pct!);
    expect(curve.depthAt5Pct).toBeGreaterThan(curve.depthAt2Pct!);
  });

  it("handles zero reserve pools safely without division by zero", () => {
    const curve = buildDepthCurve(zeroReservePoolFixture);
    expect(curve.midPrice).toBe(0);
    expect(curve.bids).toHaveLength(0);
    expect(curve.asks).toHaveLength(0);
  });
});

describe("Size Ladder & Price Impact", () => {
  it("walks order book levels and calculates weighted average price", () => {
    const step = calculateOrderbookStep(
      validOrderbookFixture.orderbook!,
      "1500",
      "buy",
      0,
      0.121,
    );

    expect(step.executable).toBe(true);
    expect(step.insufficientDepth).toBe(false);

    expect(Number(step.marginalPrice)).toBe(0.124);
    expect(Number(step.averageExecutionPrice)).toBeCloseTo(0.122667, 4);
    expect(step.priceImpactPercent).toBeGreaterThan(0);
  });

  it("flags insufficient depth when order size exceeds book depth", () => {
    const step = calculateOrderbookStep(
      validOrderbookFixture.orderbook!,
      "50000",
      "buy",
      0,
      0.121,
    );

    expect(step.insufficientDepth).toBe(true);
    expect(step.executable).toBe(false);
    expect(step.warning).toContain("Insufficient liquidity depth");
  });

  it("verifies constant-product step against analytical formula with fees", () => {
    const step = calculateConstantProductStep(
      validConstantProductFixture.poolReserves!,
      "1",
      "sell",
      30,
      2000,
    );

    expect(step.executable).toBe(true);
    expect(step.insufficientDepth).toBe(false);
    expect(Number(step.averageExecutionPrice)).toBeCloseTo(1974.316, 1);
    expect(step.priceImpactPercent).toBeCloseTo(1.284, 2);
    expect(Number(step.feeAmount)).toBeGreaterThan(0);
  });

  it("builds a full size ladder with monotonic impact", () => {
    const ladder = buildSizeLadder(
      validOrderbookFixture,
      ["500", "1000", "2000", "5000"],
      "buy",
      0.121,
    );

    expect(ladder).toHaveLength(4);
    expect(ladder[0].priceImpactPercent).toBeLessThanOrEqual(ladder[1].priceImpactPercent);
    expect(ladder[1].priceImpactPercent).toBeLessThanOrEqual(ladder[2].priceImpactPercent);
  });
});

describe("Trade-Size Capacity Analysis", () => {
  it("calculates order book capacity across 1%, 2%, 5%, 10% thresholds", () => {
    const cap = calculateOrderbookCapacity(validOrderbookFixture.orderbook!, "buy", 0, 0.121);
    expect(cap.thresholds).toHaveLength(4);

    const cap1 = Number(cap.thresholds[0].maxBaseCapacity);
    const cap2 = Number(cap.thresholds[1].maxBaseCapacity);
    const cap5 = Number(cap.thresholds[2].maxBaseCapacity);
    const cap10 = Number(cap.thresholds[3].maxBaseCapacity);

    expect(cap2).toBeGreaterThanOrEqual(cap1);
    expect(cap5).toBeGreaterThanOrEqual(cap2);
    expect(cap10).toBeGreaterThanOrEqual(cap5);
  });

  it("calculates constant-product pool capacity analytically", () => {
    const cap = calculateConstantProductCapacity(
      validConstantProductFixture.poolReserves!,
      "sell",
      30,
    );

    expect(cap.thresholds).toHaveLength(4);
    expect(Number(cap.thresholds[0].maxBaseCapacity)).toBeGreaterThan(0);
    expect(Number(cap.thresholds[1].maxBaseCapacity)).toBeGreaterThan(
      Number(cap.thresholds[0].maxBaseCapacity),
    );
  });

  it("calculates capacity for unified venue", () => {
    const cap = calculateCapacity(validOrderbookFixture, "buy", 0.121);
    expect(cap.thresholds).toHaveLength(4);
    expect(Number(cap.maxObservedDepthBase)).toBe(18000);
  });
});

describe("Coverage Evaluator & Boundary Classification", () => {
  it("classifies complete coverage for healthy order book", () => {
    const rep = evaluateCoverage(validOrderbookFixture, ["500", "1000"]);
    expect(rep.status).toBe("complete");
    expect(rep.reasons).toHaveLength(0);
  });

  it("flags crossed order books as partial with descriptive reason", () => {
    const rep = evaluateCoverage(crossedOrderbookFixture);
    expect(rep.status).toBe("partial");
    expect(rep.reasons.some((r) => r.toLowerCase().includes("crossed"))).toBe(true);
  });

  it("flags empty order books as empty", () => {
    const rep = evaluateCoverage(emptyOrderbookFixture);
    expect(rep.status).toBe("empty");
    expect(rep.reasons.some((r) => r.toLowerCase().includes("empty"))).toBe(true);
  });

  it("flags stale snapshots as stale", () => {
    const rep = evaluateCoverage(staleOrderbookFixture);
    expect(rep.status).toBe("stale");
    expect(rep.isStale).toBe(true);
  });

  it("flags truncated snapshots as truncated", () => {
    const rep = evaluateCoverage(truncatedOrderbookFixture);
    expect(rep.status).toBe("truncated");
    expect(rep.isTruncated).toBe(true);
  });

  it("flags zero reserve pools as empty", () => {
    const rep = evaluateCoverage(zeroReservePoolFixture);
    expect(rep.status).toBe("empty");
    expect(rep.reasons.some((r) => r.toLowerCase().includes("zero"))).toBe(true);
  });

  it("flags identical base and quote assets as unavailable", () => {
    const rep = evaluateCoverage(sameAssetFixture);
    expect(rep.status).toBe("unavailable");
    expect(rep.reasons.some((r) => r.toLowerCase().includes("same asset"))).toBe(true);
  });

  it("flags unsupported models as unsupported", () => {
    const rep = evaluateCoverage(unsupportedPoolFixture);
    expect(rep.status).toBe("unsupported");
    expect(rep.reasons.some((r) => r.toLowerCase().includes("not supported"))).toBe(true);
  });
});

describe("Service Orchestrator", () => {
  it("assembles complete analysis result with disclaimer and schemaVersion", async () => {
    const res = await getLiquidityDepth({
      venue: validOrderbookFixture,
      side: "buy",
      sizes: ["100", "500", "1000"],
    });

    expect(res.schemaVersion).toBe("liquidity-depth/2026-01");
    expect(res.disclaimer).toContain("Never creates executable quotes");
    expect(res.curve.midPrice).toBeCloseTo(0.121, 4);
    expect(res.ladder).toHaveLength(3);
    expect(res.capacity.thresholds).toHaveLength(4);
    expect(res.coverage.status).toBe("complete");
  });
});
