import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOCATION_LIMITS,
  AllocationDriftError,
  inspectAllocationDrift,
  type AllocationDeps,
} from "@/server/research/allocation-drift";
import {
  allocationRequest,
  balancedTarget,
  currentSnapshot,
  DAI,
  earlierSnapshot,
  foreignWallet,
  invalidTarget,
  network,
  recordedObservations,
  unavailableRead,
  unpricedSnapshot,
  USDC,
  wallet,
  WETH,
} from "./fixtures";

const mocks = vi.hoisted(() => ({ getPortfolioSnapshot: vi.fn() }));
vi.mock("@/server/portfolio/getPortfolio", () => ({ getPortfolioSnapshot: mocks.getPortfolioSnapshot }));

function reader(snapshot = currentSnapshot()): AllocationDeps {
  return { readPortfolio: async () => snapshot };
}

const onTarget = allocationRequest({ windowStart: "2026-11-01T00:00:00.000Z" });

describe("inspectAllocationDrift: input", () => {
  it("rejects a request that is not a valid wallet, network and window", async () => {
    await expect(inspectAllocationDrift({}, reader())).rejects.toBeInstanceOf(AllocationDriftError);
    await expect(inspectAllocationDrift(allocationRequest({ network: "solana" }), reader())).rejects.toThrowError(
      /matching public wallet/,
    );
  });

  it("rejects a target that does not sum to one hundred percent before reading anything", async () => {
    const readPortfolio = vi.fn();
    await expect(
      inspectAllocationDrift(allocationRequest({ targets: invalidTarget() }), { readPortfolio }),
    ).rejects.toThrowError(/sum to exactly 100%/);
    expect(readPortfolio).not.toHaveBeenCalled();
  });

  it("refuses more history than the documented limit", async () => {
    const history = Array.from({ length: ALLOCATION_LIMITS.maxSnapshots + 1 }, (_, index) => ({
      ...earlierSnapshot(),
      at: new Date(Date.parse("2026-11-01T00:00:00.000Z") + index * 60_000).toISOString(),
    }));
    await expect(inspectAllocationDrift(allocationRequest({ history }), reader())).rejects.toThrowError(
      AllocationDriftError,
    );
  });
});

describe("inspectAllocationDrift: evidence", () => {
  it("reports the provider as unavailable without fabricating holdings", async () => {
    const recorded = unavailableRead();
    expect(recorded.source.status).toBe("unavailable");
    const result = await inspectAllocationDrift(allocationRequest({ targets: balancedTarget() }), {
      readPortfolio: async () => {
        throw new AllocationDriftError("unavailable", recorded.source.detail);
      },
    });
    expect(result).toEqual({
      state: "unavailable",
      snapshot: null,
      report: null,
      reason: "Portfolio provider unavailable. No holdings or prices were fabricated.",
    });
  });

  it("propagates a malformed read instead of reporting it as unavailable", async () => {
    await expect(
      inspectAllocationDrift(allocationRequest(), {
        readPortfolio: async () => {
          throw new AllocationDriftError("malformed_snapshot", "Portfolio snapshot is missing holdings.");
        },
      }),
    ).rejects.toThrowError(/missing holdings/);
  });

  it("refuses a read that answers for a different wallet", async () => {
    await expect(
      inspectAllocationDrift(allocationRequest(), reader({ ...currentSnapshot(), walletAddress: foreignWallet })),
    ).rejects.toThrowError(/different portfolio identity/);
  });

  it("returns the observed portfolio alone when no target is defined yet", async () => {
    const result = await inspectAllocationDrift(allocationRequest(), reader());
    expect(result.state).toBe("ready");
    expect(result.report).toBeNull();
    expect(result.snapshot?.holdings).toHaveLength(3);
  });
});

describe("inspectAllocationDrift: report", () => {
  it("answers the recorded fixture with hand-checked drift, crossings and restoration amounts", async () => {
    const result = await inspectAllocationDrift(
      { ...onTarget, targets: balancedTarget(), history: [earlierSnapshot()] },
      reader(),
    );
    const report = result.report!;
    expect(report.state).toBe("complete");
    expect(report.totalUsd).toBe("100000");
    expect(report.current.rows.map((row) => [row.key, row.driftBps, row.restoreUsd, row.restoreQuantity])).toEqual([
      [WETH, "1000", "-10000", "-4"],
      [USDC, "-1000", "10000", "10000"],
      [DAI, "0", "0", "0"],
    ]);
    expect(report.history.map((point) => point.at)).toEqual(["2026-11-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z"]);
    expect(report.crossings).toEqual([
      { at: "2026-11-20T00:00:00.000Z", key: WETH, direction: "above", driftBps: "1000" },
      { at: "2026-11-20T00:00:00.000Z", key: USDC, direction: "above", driftBps: "-1000" },
    ]);
    expect(report.coverage).toHaveLength(2);
  });

  it("marks the report partial when the window starts before the first observation", async () => {
    const result = await inspectAllocationDrift(
      { ...allocationRequest(), targets: balancedTarget(), history: [earlierSnapshot()] },
      reader(),
    );
    expect(result.report?.state).toBe("partial");
    expect(result.report?.coverage.join(" ")).toMatch(/do not cover the beginning/);
  });

  it("marks the report partial and withholds drift when a holding is unpriced", async () => {
    const result = await inspectAllocationDrift(
      { ...onTarget, targets: balancedTarget(), history: [] },
      reader(unpricedSnapshot()),
    );
    expect(result.report?.state).toBe("partial");
    expect(result.report?.current.rows.every((row) => row.driftBps === null)).toBe(true);
    expect(result.report?.coverage.join(" ")).toMatch(/no usable price/);
  });

  it("never returns a transaction, call data or signing material", async () => {
    const result = await inspectAllocationDrift({ ...onTarget, targets: balancedTarget() }, reader());
    expect(JSON.stringify(result)).not.toMatch(/0x[a-f0-9]{64}|transaction|xdr|calldata|signature/i);
  });
});

describe("inspectAllocationDrift: production portfolio reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes the live portfolio read API response", async () => {
    mocks.getPortfolioSnapshot.mockResolvedValue({
      portfolio: recordedObservations()[1],
      source: { status: "connected", provider: "real_portfolio", detail: "ok" },
    });
    const result = await inspectAllocationDrift(allocationRequest());
    expect(mocks.getPortfolioSnapshot).toHaveBeenCalledWith(wallet, network);
    expect(result.snapshot).toMatchObject({ source: "Live portfolio read API", completeValuation: true });
  });

  it("treats a disconnected provider as unavailable", async () => {
    mocks.getPortfolioSnapshot.mockResolvedValue(unavailableRead());
    const result = await inspectAllocationDrift(allocationRequest({ targets: balancedTarget() }));
    expect(result.state).toBe("unavailable");
    expect(result.snapshot).toBeNull();
  });
});

describe("public entry point", () => {
  it("publishes the documented request bounds", () => {
    expect(ALLOCATION_LIMITS).toEqual({
      maxRequestBytes: 200_000,
      maxHoldings: 200,
      maxTargets: 100,
      maxSnapshots: 80,
      maxWindowMs: 90 * 86_400_000,
    });
  });

  it("publishes a typed error with a stable code", () => {
    const error = new AllocationDriftError("invalid_request", "nope");
    expect(error).toBeInstanceOf(Error);
    expect([error.name, error.code]).toEqual(["AllocationDriftError", "invalid_request"]);
  });
});
