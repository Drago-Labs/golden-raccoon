import { describe, expect, it, vi } from "vitest";
import { reconcileBalances } from "@/server/research/balance-reconciliation";
import { coverageNotice } from "@/server/research/balance-reconciliation/coverage";
import { effectsUrl, readAccountHistory } from "@/server/research/balance-reconciliation/effectReader";
import { BalanceReconciliationError } from "@/server/research/balance-reconciliation/errors";
import { BALANCE_LIMITS } from "@/server/research/balance-reconciliation/limits";
import { horizonBase } from "@/server/research/balance-reconciliation/networkIdentity";
import { balanceRequestSchema } from "@/server/research/balance-reconciliation/schema";
import { depsFor, feeBumpFixture, matchedFixture, requestFor, unavailableDeps, unexplainedFixture } from "./fixtures";

describe("reconcileBalances", () => {
  it("matches a recorded account to the stroop without merging issuers", async () => {
    const report = await reconcileBalances(requestFor(matchedFixture), depsFor(matchedFixture));
    const usd = report.reconciliation.filter((row) => row.asset.startsWith("USD:"));

    expect(report.matched).toBe(true);
    expect(report.state).toBe("complete");
    expect(report.reconciliation.find((row) => row.asset === "native")?.reconstructedStroops).toBe("139999900");
    expect(usd).toHaveLength(2);
    expect(usd[0]?.asset).not.toBe(usd[1]?.asset);
    expect(usd.every((row) => row.deltaStroops === "0")).toBe(true);
    expect(report.pricesConverted).toBe(false);
    expect(report.coverageNotice).toBe(coverageNotice("complete", true, report.oldestLedger));
  });

  it("reports the unexplained delta instead of a match", async () => {
    const report = await reconcileBalances(requestFor(unexplainedFixture), depsFor(unexplainedFixture));
    expect(report.matched).toBe(false);
    expect(report.reconciliation[0]?.deltaStroops).toBe("2");
    expect(report.coverageNotice).toMatch(/unexplained delta/i);
  });

  it("attributes the fee-bump fee to the sponsor", async () => {
    const report = await reconcileBalances(requestFor(feeBumpFixture), depsFor(feeBumpFixture));
    expect(report.matched).toBe(true);
    expect(report.timeline).toEqual([
      expect.objectContaining({ category: "fee", asset: "native", stroops: "-300" }),
    ]);
  });

  it("does not call truncated history a match", async () => {
    const report = await reconcileBalances(requestFor(matchedFixture), depsFor(matchedFixture, true));
    expect(report.state).toBe("partial");
    expect(report.matched).toBe(false);
    expect(report.coverageNotice).toMatch(/not treated as a match/i);
  });

  it("returns unavailable without a reconstructed balance", async () => {
    const report = await reconcileBalances(requestFor(matchedFixture), unavailableDeps());
    expect(report.state).toBe("unavailable");
    expect(report.timeline).toEqual([]);
    expect(report.matched).toBe(false);
  });

  it("pages effects on the selected network and rejects a bad passphrase before reading", async () => {
    expect(horizonBase("stellar-pubnet")).toBe("https://horizon.stellar.org");
    expect(effectsUrl("stellar-pubnet", matchedFixture.account, null)).not.toContain("horizon-testnet");
    const history = await readAccountHistory("stellar-pubnet", matchedFixture.account, async (url) => {
      expect(String(url)).not.toContain("horizon-testnet");
      return new Response(JSON.stringify({ _embedded: { records: [] } }), { status: 200 });
    }, { pageSize: 1, maxPages: 1, maxEffects: 10 });
    expect(history.status).toBe("ok");

    const readHistory = vi.fn(async () => ({ status: "missing" as const }));
    await expect(
      reconcileBalances(
        { ...requestFor(matchedFixture), passphrase: "Public Global Stellar Network ; September 2015" },
        { readHistory },
      ),
    ).rejects.toBeInstanceOf(BalanceReconciliationError);
    expect(readHistory).not.toHaveBeenCalled();
    expect(balanceRequestSchema.safeParse({ account: matchedFixture.account, network: "stellar-testnet", fromLedger: 5, toLedger: 1 }).success).toBe(false);
    expect(BALANCE_LIMITS.maxPages).toBeGreaterThan(0);
  });
});
