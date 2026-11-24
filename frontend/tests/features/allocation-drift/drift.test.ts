import { describe, expect, it } from "vitest";
import { driftPoint } from "@/server/research/allocation-drift/drift";
import { AllocationDriftError } from "@/server/research/allocation-drift/errors";
import { calculateWeights, decimal, normalizedPortfolio, units, USD_SCALE } from "@/server/research/allocation-drift/weights";
import { balancedTarget, currentSnapshot, DAI, network, recordedObservations, unpricedSnapshot, USDC, WETH } from "./fixtures";

describe("weights: fixed-point helpers", () => {
  it("parses USD strings into eight-decimal units", () => {
    expect(units("1")).toBe(USD_SCALE);
    expect(units("1.5")).toBe(150_000_000n);
    expect(units("0.000000019")).toBe(1n); // Beyond eight decimals is truncated, never rounded up.
  });

  it("renders units back without trailing zeros and keeps the sign", () => {
    expect(decimal(150_000_000n)).toBe("1.5");
    expect(decimal(-150_000_000n)).toBe("-1.5");
    expect(decimal(0n)).toBe("0");
    expect(decimal(100_000n, 2)).toBe("1000");
  });

  it("refuses values that are not nonnegative decimal strings", () => {
    expect(() => units("-1")).toThrowError(AllocationDriftError);
    expect(() => units("1e9")).toThrowError(/nonnegative decimal strings/);
  });
});

describe("weights: normalizing a recorded portfolio read", () => {
  it("derives a lower-cased chain-scoped identity per holding", () => {
    const snapshot = currentSnapshot();
    expect(snapshot.holdings.map((holding) => holding.key)).toEqual([WETH, USDC, DAI]);
    expect(snapshot.holdings[0]).toMatchObject({ label: "WETH", valueUsd: "60000.00000000", priceUsd: "2500.00000000" });
    expect(snapshot.completeValuation).toBe(true);
    expect(snapshot.at).toBe("2026-11-20T00:00:00.000Z");
  });

  it("marks the valuation incomplete when the provider could not price a holding", () => {
    const snapshot = unpricedSnapshot();
    expect(snapshot.completeValuation).toBe(false);
    expect(snapshot.holdings[2].priceUsd).toBeNull();
  });

  it("rejects a read that is missing wallet, observation time or holdings", () => {
    expect(() => normalizedPortfolio(null, network)).toThrowError(/missing wallet/);
    expect(() => normalizedPortfolio({ walletAddress: "0x1", holdings: [] }, network)).toThrowError(/missing wallet/);
  });

  it("rejects a read recorded on a different network", () => {
    const observation = recordedObservations()[1];
    expect(() => normalizedPortfolio(observation, "base")).toThrowError(/network does not match/);
  });

  it("rejects a holding with no identity or an unusable USD value", () => {
    const observation = recordedObservations()[1];
    expect(() =>
      normalizedPortfolio({ ...observation, holdings: [{ ...observation.holdings[0], tokenAddress: "" }] }, network),
    ).toThrowError(/no asset identity/);
    expect(() =>
      normalizedPortfolio({ ...observation, holdings: [{ ...observation.holdings[0], valueUsd: -5 }] }, network),
    ).toThrowError(/invalid USD value/);
  });
});

describe("weights: current allocation", () => {
  it("matches the hand calculation on the recorded portfolio", () => {
    const { total, positions } = calculateWeights(currentSnapshot(), balancedTarget());
    expect(decimal(total)).toBe("100000");
    expect(positions.map((position) => [position.key, position.basisPoints, position.targetBps])).toEqual([
      [WETH, "6000", 5000],
      [USDC, "3000", 4000],
      [DAI, "1000", 1000],
    ]);
  });

  it("reports an asset held outside the target groups as unallocated", () => {
    const target = {
      version: 1 as const,
      mode: "group" as const,
      entries: [
        { key: "group:volatile", label: "Volatile", basisPoints: 6000, members: [WETH] },
        { key: "group:stables", label: "Stables", basisPoints: 4000, members: [USDC] },
      ],
    };
    const { positions } = calculateWeights(currentSnapshot(), target);
    expect(positions.map((position) => [position.key, position.basisPoints])).toEqual([
      ["group:volatile", "6000"],
      ["group:stables", "3000"],
      ["__unallocated__", "1000"],
    ]);
  });

  it("counts a targeted asset the wallet does not hold as zero rather than dropping it", () => {
    const snapshot = { ...currentSnapshot(), holdings: currentSnapshot().holdings.slice(0, 2) };
    const { positions } = calculateWeights(snapshot, balancedTarget());
    expect(positions.find((position) => position.key === DAI)).toMatchObject({ valueUnits: 0n, basisPoints: "0" });
  });

  it("withholds weights when a holding has no usable price", () => {
    const { positions } = calculateWeights(unpricedSnapshot(), balancedTarget());
    expect(positions.every((position) => position.basisPoints === null)).toBe(true);
  });

  it("rejects a snapshot that repeats an asset identity", () => {
    const snapshot = currentSnapshot();
    expect(() =>
      calculateWeights({ ...snapshot, holdings: [snapshot.holdings[0], snapshot.holdings[0]] }, balancedTarget()),
    ).toThrowError(/Duplicate asset identity/);
  });
});

describe("drift: one observation against a target", () => {
  it("matches the hand calculation documented for the recorded fixture", () => {
    // 100,000 USD observed: WETH 60,000 (60%) against a 50% target is +1,000 bps,
    // and 50,000 - 60,000 = -10,000 USD, which is -4 WETH at the recorded 2,500 USD price.
    const point = driftPoint(currentSnapshot(), balancedTarget());
    expect(point.at).toBe("2026-11-20T00:00:00.000Z");
    expect(point.rows).toEqual([
      {
        key: WETH,
        label: "WETH",
        currentUsd: "60000",
        currentBps: "6000",
        targetBps: 5000,
        driftBps: "1000",
        restoreUsd: "-10000",
        restoreQuantity: "-4",
      },
      {
        key: USDC,
        label: "USDC",
        currentUsd: "30000",
        currentBps: "3000",
        targetBps: 4000,
        driftBps: "-1000",
        restoreUsd: "10000",
        restoreQuantity: "10000",
      },
      {
        key: DAI,
        label: "DAI",
        currentUsd: "10000",
        currentBps: "1000",
        targetBps: 1000,
        driftBps: "0",
        restoreUsd: "0",
        restoreQuantity: "0",
      },
    ]);
  });

  it("reports drift and restoration as unavailable instead of guessing an unpriced holding", () => {
    const point = driftPoint(unpricedSnapshot(), balancedTarget());
    expect(point.rows.every((row) => row.driftBps === null && row.restoreUsd === null)).toBe(true);
  });

  it("keeps a group drift row free of an asset quantity", () => {
    const target = {
      version: 1 as const,
      mode: "group" as const,
      entries: [
        { key: "group:volatile", label: "Volatile", basisPoints: 5000, members: [WETH] },
        { key: "group:stables", label: "Stables", basisPoints: 5000, members: [USDC, DAI] },
      ],
    };
    const point = driftPoint(currentSnapshot(), target);
    expect(point.rows[0]).toMatchObject({ driftBps: "1000", restoreUsd: "-10000", restoreQuantity: null });
    expect(point.rows[1]).toMatchObject({ currentUsd: "40000", driftBps: "-1000", restoreUsd: "10000" });
  });
});
