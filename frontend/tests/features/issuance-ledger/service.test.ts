import { describe, expect, it, vi } from "vitest";
import { horizonBase } from "@/server/research/issuance-ledger/assetIdentity";
import { coverageNotice } from "@/server/research/issuance-ledger/coverage";
import { IssuanceLedgerError } from "@/server/research/issuance-ledger/errors";
import { ISSUANCE_LIMITS } from "@/server/research/issuance-ledger/limits";
import { operationsUrl, readIssuerHistory } from "@/server/research/issuance-ledger/issuerOperations";
import { reconcileIssuance } from "@/server/research/issuance-ledger";
import { issuanceRequestSchema } from "@/server/research/issuance-ledger/schema";
import {
  burnHeavyFixture,
  depsFor,
  reconciledFixture,
  requestFor,
  unavailableDeps,
  unreconciledFixture,
} from "./fixtures";

describe("reconcileIssuance", () => {
  it("matches fixture checkpoints for a reconciled asset", async () => {
    const report = await reconcileIssuance(requestFor(reconciledFixture), depsFor(reconciledFixture));
    expect(report.reconciled).toBe(true);
    expect(report.state).toBe("complete");
    expect(report.reconstructedSupplyStroops).toBe("120000000");
    expect(report.checkpoints.every((row) => row.reconciled)).toBe(true);
    expect(report.coverageNotice).toBe(coverageNotice("complete", true, report.oldestLedger, false));
    expect(report.readOnly).toBe(true);
  });

  it("reports unreconciled differences instead of a match", async () => {
    const report = await reconcileIssuance(requestFor(unreconciledFixture), depsFor(unreconciledFixture));
    expect(report.reconciled).toBe(false);
    expect(report.unreconciled[0]?.deltaStroops).toBe("2");
    expect(report.unreconciled[0]?.surrounding.length).toBeGreaterThan(0);
    expect(report.coverageNotice).toMatch(/does not equal the network-reported amount/i);
  });

  it("rebuilds a burn-heavy ledger down to residual supply", async () => {
    const report = await reconcileIssuance(requestFor(burnHeavyFixture), depsFor(burnHeavyFixture));
    expect(report.reconciled).toBe(true);
    expect(report.reconstructedSupplyStroops).toBe("10000000");
    expect(report.operations.filter((op) => op.kind === "burn")).toHaveLength(2);
  });

  it("does not call truncated history reconciled", async () => {
    const report = await reconcileIssuance(requestFor(reconciledFixture), depsFor(reconciledFixture, true));
    expect(report.state).toBe("partial");
    expect(report.reconciled).toBe(false);
    expect(report.coverageNotice).toMatch(/not treated as reconciled/i);
  });

  it("returns unavailable without inventing supply", async () => {
    const report = await reconcileIssuance(requestFor(reconciledFixture), unavailableDeps());
    expect(report.state).toBe("unavailable");
    expect(report.operations).toEqual([]);
    expect(report.reconciled).toBe(false);
  });

  it("pages issuer operations on the selected network and rejects a bad passphrase", async () => {
    expect(horizonBase("stellar-pubnet")).toBe("https://horizon.stellar.org");
    expect(operationsUrl("stellar-pubnet", reconciledFixture.issuer, null)).not.toContain("horizon-testnet");
    const history = await readIssuerHistory(
      "stellar-pubnet",
      { code: reconciledFixture.asset_code, issuer: reconciledFixture.issuer },
      10,
      20,
      async (url) => {
        expect(String(url)).not.toContain("horizon-testnet");
        if (String(url).includes("/assets")) {
          return new Response(JSON.stringify({ _embedded: { records: [{ amount: "0.0000000" }] } }), { status: 200 });
        }
        return new Response(JSON.stringify({ _embedded: { records: [] } }), { status: 200 });
      },
      { pageSize: 1, maxPages: 1, maxOperations: 10 },
    );
    expect(history.status).toBe("ok");

    const readHistory = vi.fn(async () => ({ status: "missing" as const }));
    await expect(
      reconcileIssuance(
        { ...requestFor(reconciledFixture), passphrase: "Public Global Stellar Network ; September 2015" },
        { readHistory },
      ),
    ).rejects.toBeInstanceOf(IssuanceLedgerError);
    expect(readHistory).not.toHaveBeenCalled();
    expect(
      issuanceRequestSchema.safeParse({
        assetCode: reconciledFixture.asset_code,
        issuer: reconciledFixture.issuer,
        network: "stellar-testnet",
        fromLedger: 5,
        toLedger: 1,
      }).success,
    ).toBe(false);
    expect(ISSUANCE_LIMITS.maxPages).toBeGreaterThan(0);
  });
});
