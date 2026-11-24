import { describe, expect, it } from "vitest";
import { ClmmPositionsError } from "@/server/research/clmm-positions/errors";
import { explainClmmPositions } from "@/server/research/clmm-positions/service";
import {
  ADDRESS,
  closedFixture,
  depsFromFixture,
  depsFromPositions,
  inRangeFixture,
  outOfRangeFixture,
  unavailableFixture,
} from "./fixtures";

describe("clmm positions service", () => {
  it("rejects invalid requests", async () => {
    await expect(explainClmmPositions({})).rejects.toThrow(ClmmPositionsError);
  });

  it("matches in-range fixture amounts exactly", async () => {
    const report = await explainClmmPositions(
      { address: ADDRESS, network: "ethereum" },
      depsFromFixture(inRangeFixture),
    );
    expect(report.state).toBe("complete");
    expect(report.positions).toHaveLength(1);
    expect(report.positions[0].amounts.amount0Raw).toBe(inRangeFixture.expected.amount0Raw);
    expect(report.positions[0].amounts.amount1Raw).toBe(inRangeFixture.expected.amount1Raw);
    expect(report.positions[0].fees.token0Raw).toBe(inRangeFixture.expected.fees0Raw);
    expect(report.positions[0].range.inRange).toBe(true);
    expect(report.totals.openPositions).toBe(1);
  });

  it("shows distance to nearest bound for out-of-range positions", async () => {
    const report = await explainClmmPositions(
      { address: ADDRESS, network: "ethereum" },
      depsFromFixture(outOfRangeFixture),
    );
    expect(report.positions[0].range.status).toBe("out_of_range_above");
    expect(report.positions[0].range.distanceToNearestBoundPercent).toBe(
      outOfRangeFixture.expected.distanceToNearestBoundPercent,
    );
    expect(report.totals.outOfRangePositions).toBe(1);
  });

  it("lists closed positions but excludes them from open totals", async () => {
    const report = await explainClmmPositions(
      { address: ADDRESS, network: "ethereum" },
      depsFromPositions(
        [inRangeFixture.position!, closedFixture.position!],
        {
          [inRangeFixture.pool!.pool]: inRangeFixture.pool!,
        },
      ),
    );
    expect(report.positions).toHaveLength(2);
    expect(report.totals.closedPositions).toBe(1);
    expect(report.totals.openPositions).toBe(1);
    expect(report.totals.amount0).toBe(inRangeFixture.expected.amount0);
    expect(report.totals.amount1).toBe(inRangeFixture.expected.amount1);
  });

  it("returns unavailable when the provider is down", async () => {
    const report = await explainClmmPositions(
      { address: ADDRESS, network: "ethereum" },
      depsFromFixture(unavailableFixture),
    );
    expect(report.state).toBe("unavailable");
    expect(report.positions).toEqual([]);
  });
});
