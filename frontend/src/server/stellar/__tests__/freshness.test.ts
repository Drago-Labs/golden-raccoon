import { describe, expect, it } from "vitest";
import {
  calculateLedgerLag,
  DEFAULT_MAX_LEDGER_LAG,
  evaluateFreshness,
  findHighestLedger,
  isLedgerStale,
} from "../probes/freshness";

describe("Stellar RPC Freshness & Lag Probes", () => {
  it("finds the highest observed ledger among endpoints", () => {
    const endpoints = [
      { url: "https://rpc1.test", ledgerHeight: 100 },
      { url: "https://rpc2.test", ledgerHeight: 105 },
      { url: "https://rpc3.test", ledgerHeight: 102 },
      { url: "https://rpc4.test", ledgerHeight: undefined },
    ];
    expect(findHighestLedger(endpoints)).toBe(105);
  });

  it("returns undefined when no endpoints report a ledger height", () => {
    const endpoints = [
      { url: "https://rpc1.test", ledgerHeight: undefined },
      { url: "https://rpc2.test" },
    ];
    expect(findHighestLedger(endpoints)).toBeUndefined();
  });

  it("calculates ledger lag correctly against network head", () => {
    expect(calculateLedgerLag(105, 105)).toBe(0);
    expect(calculateLedgerLag(100, 105)).toBe(5);
    expect(calculateLedgerLag(undefined, 105)).toBeUndefined();
    expect(calculateLedgerLag(100, undefined)).toBeUndefined();
    expect(calculateLedgerLag(108, 105)).toBe(0);
  });

  it("identifies stale ledgers exceeding max lag threshold", () => {
    expect(isLedgerStale(0, DEFAULT_MAX_LEDGER_LAG)).toBe(false);
    expect(isLedgerStale(3, DEFAULT_MAX_LEDGER_LAG)).toBe(false);
    expect(isLedgerStale(4, DEFAULT_MAX_LEDGER_LAG)).toBe(true);
    expect(isLedgerStale(10, 2)).toBe(true);
    expect(isLedgerStale(undefined, DEFAULT_MAX_LEDGER_LAG)).toBe(false);
  });

  it("evaluates freshness across a cluster of endpoints and penalizes laggards", () => {
    const endpoints = [
      { url: "https://fresh1.test", ledgerHeight: 1000 },
      { url: "https://fresh2.test", ledgerHeight: 999 },
      { url: "https://lagging.test", ledgerHeight: 995 },
      { url: "https://offline.test", ledgerHeight: undefined },
    ];

    const highest = findHighestLedger(endpoints);
    expect(highest).toBe(1000);

    const fresh1 = evaluateFreshness(1000, highest, 3);
    expect(fresh1.highestObservedLedger).toBe(1000);
    expect(fresh1.lag).toBe(0);
    expect(fresh1.isStale).toBe(false);

    const fresh2 = evaluateFreshness(999, highest, 3);
    expect(fresh2.lag).toBe(1);
    expect(fresh2.isStale).toBe(false);

    const lagging = evaluateFreshness(995, highest, 3);
    expect(lagging.lag).toBe(5);
    expect(lagging.isStale).toBe(true);

    const offline = evaluateFreshness(undefined, highest, 3);
    expect(offline.lag).toBeUndefined();
    expect(offline.isStale).toBe(false);
  });
});
