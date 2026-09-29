import { describe, expect, it } from "vitest";
import { analyseVestingUnlocks } from "@/server/research/vesting-unlock/service";
import { formatBaseUnits, parseAmount, splitExact, sumBaseUnits } from "@/server/research/vesting-unlock/unitMath";
import { applyRevisions, expandSchedule } from "@/server/research/vesting-unlock/normalize";
import { isObservationStale } from "@/server/research/vesting-unlock/time";
import {
  BENEFICIARY,
  CLIFF_SCHEDULE,
  FULL_WORLD,
  LINEAR_SCHEDULE,
  REVISION_NEW,
  REVISION_OLD,
  createTestReader,
  request,
} from "./fixtures";

describe("exact arithmetic", () => {
  it("keeps every digit of a wei-scale sum that floating point would lose", () => {
    const operands = ["1000000000000000001", "1000000000000000001"];

    expect(String(Number(operands[0]) + Number(operands[1]))).toBe("2000000000000000000");
    expect(sumBaseUnits(operands)).toBe("2000000000000000002");
  });

  it("splits linear totals without losing remainder base units", () => {
    expect(splitExact("10", 3)).toEqual(["3", "3", "4"]);
    expect(sumBaseUnits(splitExact("12000000000000000000", 12))).toBe("12000000000000000000");
  });

  it("formats decimals without a floating-point detour", () => {
    expect(formatBaseUnits("1000000000000000000", 18)).toBe("1");
    expect(formatBaseUnits("10000000", 7)).toBe("1");
    expect(parseAmount("1.5")).toBeNull();
  });
});

describe("cliffs and linear vesting", () => {
  it("keeps a future cliff as scheduled onchain-enforced", async () => {
    const report = await analyseVestingUnlocks(request(), createTestReader());

    expect(report.tranches).toHaveLength(1);
    expect(report.tranches[0].state).toBe("scheduled");
    expect(report.tranches[0].sourceType).toBe("onchain_enforced");
    expect(report.tranches[0].amountBaseUnits).toBe("1000000000000000000");
    expect(report.tranches[0].beneficiary).toBe(BENEFICIARY);
  });

  it("expands linear vesting after the cliff into dated segments that sum exactly", async () => {
    const report = await analyseVestingUnlocks(
      request({ sources: [{ kind: "evm_vesting_contract", id: "0xvesting-linear", network: "ethereum" }] }),
      createTestReader(),
    );

    const total = sumBaseUnits(report.tranches.map((tranche) => tranche.amountBaseUnits));

    expect(total).toBe("12000000000000000000");
    expect(report.tranches.length).toBeGreaterThan(1);
    expect(report.tranches.every((tranche) => tranche.sourceType === "onchain_enforced")).toBe(true);
  });

  it("labels issuer-published schedules distinctly from onchain-enforced ones", async () => {
    const report = await analyseVestingUnlocks(
      request({
        sources: [{ kind: "issuer_published", id: "issuer-team-allocation", network: "ethereum" }],
      }),
      createTestReader(),
    );

    expect(report.tranches.some((tranche) => tranche.sourceType === "published_only")).toBe(true);
    expect(report.tranches.some((tranche) => tranche.state === "released")).toBe(true);
    expect(report.tranches.some((tranche) => tranche.state === "scheduled")).toBe(true);
  });
});

describe("revisions and cancellations", () => {
  it("does not double-count future unlocks after an amendment", async () => {
    const report = await analyseVestingUnlocks(
      request({ sources: [{ kind: "evm_vesting_contract", id: "0xvesting-revised", network: "ethereum" }] }),
      createTestReader(),
    );

    const scheduled = report.tranches.filter((tranche) => tranche.state === "scheduled");
    const cancelled = report.tranches.filter((tranche) => tranche.state === "cancelled");

    expect(sumBaseUnits(scheduled.map((tranche) => tranche.amountBaseUnits))).toBe("3000000000000000000");
    expect(sumBaseUnits(cancelled.map((tranche) => tranche.amountBaseUnits))).toBe("9000000000000000000");
    expect(report.coverage.countedFutureBaseUnits).toBe("3000000000000000000");
    expect(report.coverage.cancelledFutureBaseUnits).toBe("9000000000000000000");
  });

  it("marks lower revisions cancelled when only expand+applyRevisions run", () => {
    const asOf = Date.parse("2026-03-01T12:00:00.000Z");
    const combined = applyRevisions([...expandSchedule(REVISION_OLD, asOf), ...expandSchedule(REVISION_NEW, asOf)]);

    expect(combined.filter((tranche) => tranche.state === "cancelled")).toHaveLength(1);
    expect(combined.filter((tranche) => tranche.state === "scheduled")).toHaveLength(1);
  });
});

describe("evidence gaps and stale ledgers", () => {
  it("keeps unknown beneficiary as an evidence gap", async () => {
    const report = await analyseVestingUnlocks(
      request({ sources: [{ kind: "evm_vesting_contract", id: "0xvesting-anon", network: "ethereum" }] }),
      createTestReader(),
    );

    expect(report.gaps.some((gap) => gap.kind === "unknown_beneficiary")).toBe(true);
    expect(report.tranches[0].state).toBe("unknown");
    expect(report.coverage.state).toBe("partial");
  });

  it("reports unsupported contracts as evidence gaps without inventing unlocks", async () => {
    const report = await analyseVestingUnlocks(
      request({ sources: [{ kind: "evm_vesting_contract", id: "0xarbitrary", network: "ethereum" }] }),
      createTestReader(),
    );

    expect(report.tranches).toHaveLength(0);
    expect(report.gaps.some((gap) => gap.kind === "unsupported_contract")).toBe(true);
    expect(report.coverage.state).toBe("unavailable");
  });

  it("flags stale ledger observations", async () => {
    expect(
      isObservationStale({
        closeTime: "2026-02-01T00:00:00.000Z",
        observedAt: "2026-03-01T12:00:00.000Z",
        maxAgeSeconds: 3_600,
      }),
    ).toBe(true);

    const report = await analyseVestingUnlocks(
      request({
        sources: [{ kind: "evm_vesting_contract", id: "0xvesting-stale", network: "ethereum" }],
        maxObservationAgeSeconds: 3_600,
      }),
      createTestReader(),
    );

    expect(report.observation.stale).toBe(true);
    expect(report.gaps.some((gap) => gap.kind === "stale_ledger")).toBe(true);
    expect(report.coverage.state).toBe("partial");
  });

  it("normalizes a Stellar cliff with ledger identity", async () => {
    const report = await analyseVestingUnlocks(
      {
        network: "stellar-testnet",
        chainFamily: "stellar",
        asOf: "2026-03-01T12:00:00.000Z",
        sources: [{ kind: "stellar_vesting_contract", id: "CVESTINGEXAMPLE", network: "stellar-testnet" }],
      },
      createTestReader(FULL_WORLD),
    );

    expect(report.tranches[0].unlockLedger).toBe(1_100_000);
    expect(report.tranches[0].asset.chainFamily).toBe("stellar");
    expect(report.tranches[0].amountBaseUnits).toBe("10000000");
  });
});

describe("cliff classification edges", () => {
  it("marks a past cliff as released", () => {
    const past = {
      ...CLIFF_SCHEDULE,
      plan: { kind: "cliff" as const, amountBaseUnits: "100", cliffAt: "2025-01-01T00:00:00.000Z" },
    };
    const tranches = expandSchedule(past, Date.parse("2026-03-01T12:00:00.000Z"));

    expect(tranches[0].state).toBe("released");
  });

  it("refuses to invent linear segments from an inverted window", () => {
    const broken = {
      ...LINEAR_SCHEDULE,
      plan: {
        kind: "linear" as const,
        amountBaseUnits: "100",
        startAt: "2027-01-01T00:00:00.000Z",
        endAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const tranches = expandSchedule(broken, Date.parse("2026-03-01T12:00:00.000Z"));

    expect(tranches[0].state).toBe("unknown");
  });
});
