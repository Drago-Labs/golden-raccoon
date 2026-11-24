import { describe, expect, it } from "vitest";
import { driftPoint } from "@/server/research/allocation-drift/drift";
import { driftHistory } from "@/server/research/allocation-drift/driftHistory";
import { thresholdCrossings } from "@/server/research/allocation-drift/thresholds";
import {
  balancedTarget,
  currentSnapshot,
  earlierSnapshot,
  foreignWallet,
  network,
  unpricedSnapshot,
  USDC,
  wallet,
  WETH,
} from "./fixtures";

const scope = { walletAddress: wallet, network };
const windowStart = "2026-10-25T00:00:00.000Z";
const windowEnd = "2026-11-21T00:00:00.000Z";

describe("driftHistory", () => {
  it("recalculates every recorded observation in the window against the selected target", () => {
    const history = driftHistory([currentSnapshot(), earlierSnapshot()], balancedTarget(), scope, windowStart, windowEnd);
    expect(history.map((point) => point.at)).toEqual(["2026-11-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z"]);
    expect(history[0].rows.map((row) => row.driftBps)).toEqual(["0", "0", "0"]);
    expect(history[1].rows.map((row) => row.driftBps)).toEqual(["1000", "-1000", "0"]);
  });

  it("ignores observations outside the window", () => {
    const history = driftHistory(
      [currentSnapshot(), earlierSnapshot()],
      balancedTarget(),
      scope,
      "2026-11-10T00:00:00.000Z",
      windowEnd,
    );
    expect(history.map((point) => point.at)).toEqual(["2026-11-20T00:00:00.000Z"]);
  });

  it("ignores observations recorded for another wallet or network", () => {
    const foreign = { ...earlierSnapshot(), walletAddress: foreignWallet };
    const otherNetwork = { ...earlierSnapshot(), network: "base" };
    const history = driftHistory([currentSnapshot(), foreign, otherNetwork], balancedTarget(), scope, windowStart, windowEnd);
    expect(history).toHaveLength(1);
  });

  it("keeps one point per observation time when the same read is supplied twice", () => {
    const history = driftHistory(
      [currentSnapshot(), currentSnapshot(), earlierSnapshot()],
      balancedTarget(),
      scope,
      windowStart,
      windowEnd,
    );
    expect(history).toHaveLength(2);
  });

  it("refuses two different portfolios that claim the same observation time", () => {
    const conflicting = { ...earlierSnapshot(), at: currentSnapshot().at };
    expect(() => driftHistory([currentSnapshot(), conflicting], balancedTarget(), scope, windowStart, windowEnd)).toThrowError(
      /same observation time/,
    );
  });
});

describe("thresholdCrossings", () => {
  const history = driftHistory([currentSnapshot(), earlierSnapshot()], balancedTarget(), scope, windowStart, windowEnd);

  it("records the observation where absolute drift moved above the threshold", () => {
    expect(thresholdCrossings(history, 500)).toEqual([
      { at: "2026-11-20T00:00:00.000Z", key: WETH, direction: "above", driftBps: "1000" },
      { at: "2026-11-20T00:00:00.000Z", key: USDC, direction: "above", driftBps: "-1000" },
    ]);
  });

  it("records nothing when the threshold is never crossed", () => {
    expect(thresholdCrossings(history, 1500)).toEqual([]);
    expect(thresholdCrossings(history.slice(0, 1), 500)).toEqual([]);
  });

  it("records a return below the threshold", () => {
    const back = thresholdCrossings([...history].reverse(), 500);
    expect(back).toEqual([
      { at: "2026-11-01T00:00:00.000Z", key: WETH, direction: "below", driftBps: "0" },
      { at: "2026-11-01T00:00:00.000Z", key: USDC, direction: "below", driftBps: "0" },
    ]);
  });

  it("compares drift in hundredths of a basis point", () => {
    const points = [
      { at: "2026-11-01T00:00:00.000Z", rows: [{ ...history[0].rows[0], driftBps: "500" }] },
      { at: "2026-11-02T00:00:00.000Z", rows: [{ ...history[0].rows[0], driftBps: "500.01" }] },
    ];
    expect(thresholdCrossings(points, 500)).toEqual([
      { at: "2026-11-02T00:00:00.000Z", key: WETH, direction: "above", driftBps: "500.01" },
    ]);
  });

  it("establishes no crossing for an unpriced observation or an asset with no earlier value", () => {
    const unpriced = driftPoint(unpricedSnapshot(), balancedTarget());
    expect(thresholdCrossings([history[0], unpriced], 500)).toEqual([]);
    expect(thresholdCrossings([{ at: history[0].at, rows: [] }, history[1]], 500)).toEqual([]);
  });
});
