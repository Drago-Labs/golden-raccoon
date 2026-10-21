import { describe, expect, it } from "vitest";
import { findLedgerGaps, isLedgerFull, summarizeCapacity, usageBasisPoints } from "@/server/research/network-congestion/capacity";
import { gapWindow, quietWindow, surgeWindow } from "./fixtures";

describe("capacity", () => {
  it("measures the quiet window without treating it as full", () => {
    const summary = summarizeCapacity(quietWindow.ledgers, []);

    expect(summary.presentLedgerCount).toBe(3);
    expect(summary.fullLedgerCount).toBe(0);
    expect(summary.ledgers.map((ledger) => ledger.usageBasisPoints)).toEqual([200, 100, 400]);
    // (200 + 100 + 400) / 3 = 233, integer floor.
    expect(summary.meanUsageBasisPoints).toBe(233);
    expect(summary.ledgers.every((ledger) => ledger.full)).toBe(false);
  });

  it("marks a full transaction set and averages only those ledgers", () => {
    const summary = summarizeCapacity(surgeWindow.ledgers, []);

    expect(summary.fullLedgerCount).toBe(3);
    expect(summary.meanUsageBasisPoints).toBe(10_000);
    expect(isLedgerFull(surgeWindow.ledgers[0])).toBe(true);
  });

  it("lists a missing sequence and keeps it out of the mean", () => {
    const gaps = findLedgerGaps(300, 304, gapWindow.ledgers.map((ledger) => ledger.sequence));
    const summary = summarizeCapacity(gapWindow.ledgers, gaps);
    const withAZero = summarizeCapacity(
      [
        ...gapWindow.ledgers,
        {
          ...gapWindow.ledgers[0],
          sequence: 302,
          operationCount: 0,
          transactions: [],
        },
      ],
      [],
    );

    expect(gaps).toEqual([{ fromSequence: 302, toSequence: 302, missingCount: 1 }]);
    expect(summary.presentLedgerCount).toBe(4);
    expect(summary.gaps).toEqual(gaps);
    // (10000 + 10000 + 10000 + 2000) / 4 = 8000. A hole counted as zero would be 6400.
    expect(summary.meanUsageBasisPoints).toBe(8_000);
    expect(withAZero.meanUsageBasisPoints).not.toBe(summary.meanUsageBasisPoints);
  });

  it("does not invent usage when the maximum is zero", () => {
    expect(usageBasisPoints({ operationCount: 4, maxOperations: 0 })).toBeNull();
    expect(isLedgerFull({ operationCount: 4, maxOperations: 0 })).toBe(false);

    const summary = summarizeCapacity(
      [{ ...quietWindow.ledgers[0], maxOperations: 0, operationCount: 4 }],
      [],
    );

    expect(summary.meanUsageBasisPoints).toBeNull();
    expect(summary.ledgers[0].full).toBe(false);
  });

  it("collapses a run of missing sequences into one gap", () => {
    expect(findLedgerGaps(1, 6, [1, 5])).toEqual([
      { fromSequence: 2, toSequence: 4, missingCount: 3 },
      { fromSequence: 6, toSequence: 6, missingCount: 1 },
    ]);
  });
});
