import { describe, expect, it } from "vitest";
import { ExposureMapError, fromMicroUsd, toMicroUsd } from "@/server/research/exposure-map/schema";
import { buildExposureMap } from "@/server/research/exposure-map/service";
import {
  ambiguousDeclaration,
  emptyPortfolio,
  nestedCycleDoubleCounting,
  partialPricesUnresolved,
  sharedIssuerMixedChain,
} from "./fixtures";

describe("shared issuer grouping", () => {
  it("groups distinct assets that share a documented issuer", () => {
    const { map } = buildExposureMap(sharedIssuerMixedChain);
    const pubnetIssuer = map.groups.find((group) => group.nodeId === "issuer:stellar-pubnet:centre consortium");

    expect(pubnetIssuer).toBeDefined();
    expect(pubnetIssuer?.holdingCount).toBe(2);
    // 1000 USDC + 500 EURC, exactly.
    expect(pubnetIssuer?.totalMicroUsd).toBe(toMicroUsd(1_500));
    expect(fromMicroUsd(pubnetIssuer!.totalMicroUsd)).toBe(1_500);
  });

  it("keeps same-symbol assets with different issuers separate", () => {
    const { map } = buildExposureMap(sharedIssuerMixedChain);
    const group = map.groups.find((entry) => entry.nodeId === "issuer:stellar-pubnet:centre consortium");

    // The second USDC (issuer B) declared no relationship, so it is in no group.
    expect(group?.contributingHoldings.some((id) => id.includes("gbbbb"))).toBe(false);
    expect(map.unresolved.map((entry) => entry.reason)).toContain("no_declared_relationship");
  });

  it("keeps the same issuer name on different networks as separate nodes", () => {
    const { map } = buildExposureMap(sharedIssuerMixedChain);
    const nodeIds = map.groups.map((group) => group.nodeId);

    expect(nodeIds).toContain("issuer:stellar-pubnet:centre consortium");
    expect(nodeIds).toContain("issuer:ethereum:centre consortium");

    const ethereum = map.groups.find((group) => group.nodeId === "issuer:ethereum:centre consortium");
    expect(ethereum?.totalMicroUsd).toBe(toMicroUsd(750));
  });

  it("never infers a relationship from a matching symbol alone", () => {
    const { map, unmatchedDeclarations } = buildExposureMap(ambiguousDeclaration);

    expect(map.groups).toHaveLength(0);
    expect(unmatchedDeclarations).toHaveLength(1);
    expect(unmatchedDeclarations[0].reason).toMatch(/matches 2 holdings/i);
  });
});

describe("cycles, nesting and duplicates", () => {
  it("terminates deterministically and does not inflate value", () => {
    const first = buildExposureMap(nestedCycleDoubleCounting).map;
    const second = buildExposureMap(nestedCycleDoubleCounting).map;

    expect(first.groups).toEqual(second.groups);

    for (const group of first.groups) {
      // The single holding is worth 400. No group may exceed that.
      expect(group.totalMicroUsd).toBeLessThanOrEqual(toMicroUsd(400));
    }
  });

  it("attributes a holding to each reachable node exactly once", () => {
    const { map } = buildExposureMap(nestedCycleDoubleCounting);

    const alpha = map.groups.find((group) => group.label === "Alpha Pool");
    const beta = map.groups.find((group) => group.label === "Beta Vault");

    expect(alpha?.totalMicroUsd).toBe(toMicroUsd(400));
    expect(beta?.totalMicroUsd).toBe(toMicroUsd(400));
    expect(alpha?.contributingHoldings).toHaveLength(1);
    expect(beta?.contributingHoldings).toHaveLength(1);
  });

  it("records the closing edge of a cycle as dropped rather than following it", () => {
    const { map } = buildExposureMap(nestedCycleDoubleCounting);
    const dropped = map.edges.filter((edge) => edge.status === "dropped_cycle");

    expect(dropped.length).toBeGreaterThan(0);
    expect(map.coverage.cycleCount).toBeGreaterThan(0);
    expect(dropped[0].note).toMatch(/cannot inflate a total/i);
  });

  it("collapses a duplicate declaration instead of counting it twice", () => {
    const { map } = buildExposureMap(nestedCycleDoubleCounting);
    const duplicates = map.edges.filter((edge) => edge.status === "dropped_duplicate");

    expect(duplicates).toHaveLength(1);
    expect(map.edges.filter((edge) => edge.status === "applied" && edge.to === "protocol:stellar-pubnet:alpha pool")).toHaveLength(1);
  });
});

describe("coverage and unresolved holdings", () => {
  it("reports exact expected totals for a partially priced portfolio", () => {
    const { map } = buildExposureMap(partialPricesUnresolved);

    // 1000 (USDC) + 300 (LONE); MYST is unpriced and contributes nothing.
    expect(map.coverage.knownValueMicroUsd).toBe(toMicroUsd(1_300));
    expect(map.coverage.pricedHoldingCount).toBe(2);
    expect(map.coverage.unpricedHoldingCount).toBe(1);
    expect(map.coverage.state).toBe("partial");
  });

  it("lists an unpriced holding and an unmapped holding with distinct reasons", () => {
    const { map } = buildExposureMap(partialPricesUnresolved);
    const reasons = Object.fromEntries(map.unresolved.map((entry) => [entry.symbol, entry.reason]));

    expect(reasons.MYST).toBe("unpriced");
    expect(reasons.LONE).toBe("no_declared_relationship");
    expect(reasons.USDC).toBeUndefined();
  });

  it("contributes zero, not a guess, for an unpriced holding in a group", () => {
    const { map } = buildExposureMap(partialPricesUnresolved);
    const mystery = map.groups.find((group) => group.label === "Mystery Labs");

    expect(mystery?.holdingCount).toBe(1);
    expect(mystery?.totalMicroUsd).toBe(0);
  });

  it("expresses share against the known-value base rather than an assumed total", () => {
    const { map } = buildExposureMap(partialPricesUnresolved);
    const centre = map.groups.find((group) => group.label === "Centre Consortium");

    // 1000 of a 1300 known-value base.
    expect(centre?.sharePercentOfKnownValue).toBeCloseTo(76.9231, 3);
  });

  it("distinguishes empty, partial and complete states", () => {
    expect(buildExposureMap(emptyPortfolio).map.coverage.state).toBe("empty");
    expect(buildExposureMap(partialPricesUnresolved).map.coverage.state).toBe("partial");
    expect(buildExposureMap(sharedIssuerMixedChain).map.coverage.state).toBe("partial");
  });

  it("treats an empty portfolio as a valid result rather than a failure", () => {
    const { map } = buildExposureMap(emptyPortfolio);

    expect(map.groups).toHaveLength(0);
    expect(map.coverage.note).toMatch(/no exposure to map/i);
  });

  it("says that group totals overlap and do not sum to the portfolio", () => {
    const { map } = buildExposureMap(sharedIssuerMixedChain);

    expect(map.coverage.note).toMatch(/do not sum to the portfolio/i);
  });
});

describe("purity", () => {
  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(sharedIssuerMixedChain);
    buildExposureMap(sharedIssuerMixedChain);
    expect(JSON.stringify(sharedIssuerMixedChain)).toBe(before);
  });

  it("is deterministic across repeated runs", () => {
    expect(buildExposureMap(sharedIssuerMixedChain).map).toEqual(buildExposureMap(sharedIssuerMixedChain).map);
  });
});

describe("validation", () => {
  it("rejects a request with no wallet address", () => {
    expect(() => buildExposureMap({ ...sharedIssuerMixedChain, walletAddress: "" })).toThrow(ExposureMapError);
  });

  it("rejects a relationship with no provenance", () => {
    expect(() =>
      buildExposureMap({
        ...sharedIssuerMixedChain,
        relationships: [{ fromAssetKey: "USDC", kind: "issuer", targetLabel: "Anonymous" }],
      }),
    ).toThrow(ExposureMapError);
  });

  it("rejects a portfolio above the holding bound", () => {
    const oversized = {
      ...sharedIssuerMixedChain,
      holdings: Array.from({ length: 501 }, (_, index) => ({
        symbol: `T${index}`,
        chainId: "stellar-pubnet",
        balance: 1,
        priceUsd: 1,
        valueUsd: 1,
      })),
    };

    expect(() => buildExposureMap(oversized)).toThrow(ExposureMapError);
  });
});
