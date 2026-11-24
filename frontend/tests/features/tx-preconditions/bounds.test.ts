import { describe, expect, it } from "vitest";
import { evaluateLedgerBounds } from "@/server/research/tx-preconditions/ledgerBounds";
import { evaluateTimeBounds } from "@/server/research/tx-preconditions/timeBounds";
import type { DecodedPreconditions } from "@/server/research/tx-preconditions/envelopeDecode";

const empty: DecodedPreconditions = {
  minTime: null,
  maxTime: null,
  minLedger: null,
  maxLedger: null,
  minAccountSequence: null,
  minAccountSequenceAge: null,
  minAccountSequenceLedgerGap: null,
  extraSigners: [],
};

describe("time and ledger bounds", () => {
  it("treats zero time bounds as unset", () => {
    const result = evaluateTimeBounds({ ...empty, minTime: "0", maxTime: "0" }, 1_700_000_000);
    expect(result.rows[0]?.status).toBe("not_set");
    expect(result.satisfied).toBe(true);
  });

  it("marks an expired maxTime as unsatisfied", () => {
    const result = evaluateTimeBounds({ ...empty, minTime: "0", maxTime: "100" }, 200);
    expect(result.satisfied).toBe(false);
    expect(result.rows[0]?.status).toBe("unsatisfied");
    expect(result.latestUnix).toBe(100);
  });

  it("requires ledger < maxLedger", () => {
    const result = evaluateLedgerBounds({ ...empty, minLedger: 10, maxLedger: 20 }, 20);
    expect(result.satisfied).toBe(false);
    expect(result.latestLedger).toBe(19);
  });

  it("accepts a ledger inside the bounds", () => {
    const result = evaluateLedgerBounds({ ...empty, minLedger: 10, maxLedger: 20 }, 15);
    expect(result.satisfied).toBe(true);
    expect(result.rows[0]?.status).toBe("satisfied");
  });
});
