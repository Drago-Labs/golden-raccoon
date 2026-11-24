import { describe, expect, it } from "vitest";
import { evaluateSequenceRules } from "@/server/research/tx-preconditions/sequenceRules";
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

describe("sequenceRules", () => {
  it("requires the default predecessor when minAccountSequence is unset", () => {
    const result = evaluateSequenceRules(
      empty,
      "101",
      { sequence: "100", sequenceTimeUnix: 1_000, sequenceLedger: 10 },
      1_100,
      20,
    );
    expect(result.rows.find((row) => row.name === "minAccountSequence")?.status).toBe("satisfied");
  });

  it("rejects an account sequence below minAccountSequence", () => {
    const result = evaluateSequenceRules(
      { ...empty, minAccountSequence: "500" },
      "101",
      { sequence: "100", sequenceTimeUnix: 1_000, sequenceLedger: 10 },
      1_100,
      20,
    );
    expect(result.satisfied).toBe(false);
    expect(result.rows.find((row) => row.name === "minAccountSequence")?.status).toBe("unsatisfied");
  });

  it("computes earliest time from minAccountSequenceAge", () => {
    const result = evaluateSequenceRules(
      { ...empty, minAccountSequenceAge: "300" },
      "101",
      { sequence: "100", sequenceTimeUnix: 1_000, sequenceLedger: 10 },
      1_100,
      20,
    );
    expect(result.earliestUnix).toBe(1_300);
    expect(result.rows.find((row) => row.name === "minAccountSequenceAge")?.status).toBe("unsatisfied");
  });

  it("computes earliest ledger from minAccountSequenceLedgerGap", () => {
    const result = evaluateSequenceRules(
      { ...empty, minAccountSequenceLedgerGap: 15 },
      "101",
      { sequence: "100", sequenceTimeUnix: 1_000, sequenceLedger: 10 },
      2_000,
      20,
    );
    expect(result.earliestLedger).toBe(25);
    expect(result.rows.find((row) => row.name === "minAccountSequenceLedgerGap")?.status).toBe("unsatisfied");
  });
});
