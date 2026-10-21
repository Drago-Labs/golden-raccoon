import { describe, expect, it, vi } from "vitest";
import { buildHolderCoverage } from "@/server/research/stellar-holders/coverage";
import { classifyIssuerAdjacency, distributionAccountsFromToml, stellarTomlUrl } from "@/server/research/stellar-holders/issuerAdjacency";
import { measureHolderDistribution as fromIndex, HOLDER_LIMITS } from "@/server/research/stellar-holders";
import { measureHolderDistribution } from "@/server/research/stellar-holders/service";
import {
  DIST,
  ISSUER_A,
  ISSUER_B,
  PARTIAL_A,
  PARTIAL_B,
  PUB_A,
  PUB_B,
  PUB_C,
  concentrated,
  partial,
  poolHeavy,
  readerFromFixture,
  readerFromFixtures,
  unavailable,
} from "./fixtures";

describe("holder distribution service", () => {
  it("re-exports the service from the public entry point", () => {
    expect(fromIndex).toBe(measureHolderDistribution);
    expect(HOLDER_LIMITS.maxPages).toBe(5);
  });

  it("matches the hand-computed concentrated fixture and separates the distributor from the public float", async () => {
    const report = await measureHolderDistribution(
      { asset: concentrated.asset, network: concentrated.network },
      readerFromFixture(concentrated),
    );

    expect(report.state).toBe("complete");
    expect(report.ledger).toBe(482113);
    expect(report.readOnly).toBe(true);
    expect(report.coverage.fraction).toEqual({ numerator: "1", denominator: "1" });
    expect(report.concentration?.accounts.gini).toEqual({ numerator: "3", denominator: "8" });
    expect(report.concentration?.accounts.herfindahl).toEqual({ numerator: "73", denominator: "200" });
    expect(report.concentration?.accounts.topShares.find((share) => share.n === 1)?.share).toEqual({ numerator: "1", denominator: "2" });
    expect(report.concentration?.publicFloat.gini).toEqual({ numerator: "1", denominator: "3" });
    expect(report.concentration?.publicFloat.herfindahl).toEqual({ numerator: "23", denominator: "50" });
    expect(report.concentration?.publicFloat.holderCount).toBe(3);
    expect(report.holders.find((holder) => holder.accountId === DIST)?.role).toBe("distribution");
    expect(report.holders.find((holder) => holder.accountId === DIST)?.shareOfPublicFloat).toBeNull();
    expect(report.holders.find((holder) => holder.accountId === PUB_A)?.role).toBe("public");
    expect(report.supply?.buckets.find((bucket) => bucket.id === "liquidity_pools")?.baseUnits).toBe("0");
  });

  it("does not treat pool reserves as trustline holders", async () => {
    const report = await measureHolderDistribution(
      { asset: poolHeavy.asset, network: poolHeavy.network },
      readerFromFixture(poolHeavy),
    );

    expect(report.state).toBe("complete");
    expect(report.concentration?.accounts.holderCount).toBe(2);
    expect(report.concentration?.accounts.gini).toEqual({ numerator: "0", denominator: "1" });
    expect(report.concentration?.accounts.herfindahl).toEqual({ numerator: "1", denominator: "2" });
    expect(report.supply?.pools.map((pool) => pool.amount)).toEqual(["60.0000000", "20.0000000"]);
    expect(report.supply?.buckets.find((bucket) => bucket.id === "liquidity_pools")?.shareOfIssued).toEqual({ numerator: "4", denominator: "5" });
    expect(report.holders.map((holder) => holder.accountId)).not.toContain("pool-a");
  });

  it("reports the covered fraction when recorded pages do not exhaust issued supply", async () => {
    const full = await measureHolderDistribution(
      { asset: partial.asset, network: partial.network },
      readerFromFixture(partial),
    );
    const firstPage = await measureHolderDistribution(
      { asset: partial.asset, network: partial.network, maxPages: 1 },
      readerFromFixture(partial),
    );

    expect(full.state).toBe("partial");
    expect(full.coverage.truncated).toBe(false);
    expect(full.coverage.fraction).toEqual({ numerator: "1", denominator: "4" });
    expect(full.coverage.note).toContain("1/4");
    expect(full.holders.map((holder) => holder.accountId)).toContain(PUB_C);

    expect(firstPage.coverage.truncated).toBe(true);
    expect(firstPage.coverage.fraction).toEqual({ numerator: "3", denominator: "20" });
    expect(firstPage.coverage.pagesRead).toBe(1);
    expect(firstPage.holders.map((holder) => holder.accountId)).toEqual([PARTIAL_A, PARTIAL_B]);
  });

  it("returns an unavailable report when the provider fails, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const report = await measureHolderDistribution(
      { asset: unavailable.asset, network: unavailable.network },
      readerFromFixture(unavailable),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.state).toBe("unavailable");
    expect(report.coverage.fraction).toEqual({ numerator: "0", denominator: "0" });
    expect(report.error?.code).toBe("provider_unavailable");
    expect(report.error?.message).toContain("HTTP 503");
    expect(report.holders).toEqual([]);
    expect(report.concentration).toBeNull();

    vi.unstubAllGlobals();
  });

  it("does not mix two recorded assets in one reader", async () => {
    const reader = readerFromFixtures([concentrated, poolHeavy]);
    const conc = await measureHolderDistribution({ asset: concentrated.asset, network: "stellar-testnet" }, reader);
    const pools = await measureHolderDistribution({ asset: poolHeavy.asset, network: "stellar-testnet" }, reader);

    expect(conc.asset?.canonical).toBe(concentrated.asset);
    expect(pools.supply?.pools).toHaveLength(2);
    expect(conc.supply?.pools).toHaveLength(0);
  });
});

describe("coverage", () => {
  it("reduces a partial observation to the hand fraction", () => {
    const coverage = buildHolderCoverage({
      coveredBaseUnits: 150n * 10_000_000n,
      issuedAmount: "1000.0000000",
      truncated: true,
      duplicateCursor: false,
      holdersSeen: 2,
      pagesRead: 1,
      ledger: 482300,
      tomlRead: true,
      contractsBaseUnits: 0n,
    });

    expect(coverage.state).toBe("partial");
    expect(coverage.fraction).toEqual({ numerator: "3", denominator: "20" });
  });
});

describe("issuer adjacency", () => {
  it("marks the issuer ahead of a distribution listing and leaves other currencies alone", () => {
    const toml = `
ACCOUNTS=["${PUB_C}"]

[[CURRENCIES]]
code="OTHER"
issuer="${ISSUER_A}"
distribution_account="${PUB_A}"

[[CURRENCIES]]
code="CONC"
issuer="${ISSUER_A}"
distribution_account="${DIST}"
distribution_accounts=["${PUB_B}", "${ISSUER_A}"]

[[CURRENCIES]]
code="CONC"
issuer="${ISSUER_B}"
distribution_account="${PUB_C}"
`;
    const accounts = distributionAccountsFromToml(toml, "CONC", ISSUER_A);
    const classified = classifyIssuerAdjacency(
      [
        { accountId: ISSUER_A, balance: "10.0000000" },
        { accountId: DIST, balance: "10.0000000" },
        { accountId: PUB_A, balance: "5.0000000" },
        { accountId: PUB_C, balance: "1.0000000" },
      ],
      ISSUER_A,
      accounts,
    );

    expect(accounts).toEqual([DIST, PUB_B, ISSUER_A]);
    expect(classified.map((holder) => holder.role)).toEqual(["issuer", "distribution", "public", "public"]);
    expect(stellarTomlUrl("example.com")).toBe("https://example.com/.well-known/stellar.toml");
    expect(stellarTomlUrl("localhost")).toBeNull();
  });
});
