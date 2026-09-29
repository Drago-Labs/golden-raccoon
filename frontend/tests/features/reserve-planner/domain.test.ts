import { describe, expect, it } from "vitest";
import { buildReservePlan, calculateReserveBreakdown } from "@/server/research/reserve-planner";
import { accountAdapter, ledgerReader, otherWallet, stellarWallet } from "./fixtures";

const request = { walletAddress: stellarWallet, network: "stellar-testnet" as const, walletNetwork: "stellar-testnet" as const, feeAllowanceStroops: 100_000n, scenario: { action: "none" as const, count: 1 } };

describe("reserve planner domain", () => {
  it("reconciles self-funded, sponsoring and sponsored accounts exactly", async () => {
    for (const counters of [{ sponsoring: 0, sponsored: 0 }, { sponsoring: 2, sponsored: 0 }, { sponsoring: 0, sponsored: 2 }]) {
      const result = await buildReservePlan(request, { accountAdapter: accountAdapter(counters), ledgerReader });
      expect(result.state).toBe("complete");
      expect(result.before?.reconciliationStroops).toBe("0");
    }
  });

  it("subtracts selling liabilities and uses observed base reserve", async () => {
    const result = await buildReservePlan(request, { accountAdapter: accountAdapter({ selling: "3.0000000", subentries: 1 }), ledgerReader });
    expect(result.baseReserveStroops).toBe("5000000");
    expect(result.before?.sellingLiabilitiesStroops).toBe("30000000");
    expect(result.before?.minimumReserveStroops).toBe("15000000");
    expect(result.before?.spendableStroops).toBe("954900000");
  });

  it("previews sponsorship without mutating observed counters", async () => {
    const result = await buildReservePlan({ ...request, scenario: { action: "receive_sponsorship", count: 1 } }, { accountAdapter: accountAdapter(), ledgerReader });
    expect(result.beforeCounters?.numSponsored).toBe(0);
    expect(result.afterCounters?.numSponsored).toBe(1);
    expect(BigInt(result.after!.minimumReserveStroops)).toBe(BigInt(result.before!.minimumReserveStroops) - 5_000_000n);
  });

  it("rejects impossible counter changes", async () => {
    const result = await buildReservePlan({ ...request, scenario: { action: "remove_entry", count: 3 } }, { accountAdapter: accountAdapter({ subentries: 2 }), ledgerReader });
    expect(result.state).toBe("unavailable");
    expect(result.after).toBeNull();
  });

  it("marks unsupported entry types partial", async () => {
    const result = await buildReservePlan(request, { accountAdapter: accountAdapter({ assetTypes: ["future_entry"] }), ledgerReader });
    expect(result.state).toBe("partial");
    expect(result.unsupportedEntryTypes).toEqual(["future_entry"]);
  });

  it("blocks mismatched account and missing ledger parameters", async () => {
    expect((await buildReservePlan(request, { accountAdapter: accountAdapter({ wallet: otherWallet }), ledgerReader })).state).toBe("unavailable");
    expect((await buildReservePlan(request, { accountAdapter: accountAdapter(), ledgerReader: async () => { throw new Error("missing parameters"); } })).state).toBe("unavailable");
  });

  it("reports shortfall while keeping arithmetic stroop-safe", () => {
    const result = calculateReserveBreakdown({ balanceStroops: 10n, sellingLiabilitiesStroops: 5n, feeAllowanceStroops: 5n, baseReserveStroops: 5n, counters: { subentryCount: 0, numSponsoring: 0, numSponsored: 0 } });
    expect(result.spendableStroops).toBe("0");
    expect(result.shortfallStroops).toBe("10");
    expect(result.reconciliationStroops).toBe("0");
  });
});
