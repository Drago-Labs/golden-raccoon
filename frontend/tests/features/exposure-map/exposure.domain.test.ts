import { describe, it, expect } from "vitest";
import { adaptHoldings } from "@/server/research/exposure-map/holdingsAdapter";
import { buildDirectedGraph } from "@/server/research/exposure-map/graphBuilder";
import { normalizeRelationships } from "@/server/research/exposure-map/relationshipInput";
import { generateExposureMap } from "@/server/research/exposure-map/service";
import {
  SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
  NESTED_CYCLE_HOLDINGS,
  NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
  PARTIAL_PRICES_UNRESOLVED_HOLDINGS,
  EMPTY_PORTFOLIO_HOLDINGS,
} from "./fixtures";

describe("Exposure Map Domain: Holdings Adapter & Symbol Isolation", () => {
  it("isolates same-symbol assets with different issuers or contracts", () => {
    const adapted = adaptHoldings(SHARED_ISSUER_MIXED_CHAIN_HOLDINGS);
    expect(adapted).toHaveLength(3);

    const ethUsdc = adapted[0];
    const stellarUsdc = adapted[1];
    const unrelatedUsdc = adapted[2];

    expect(ethUsdc.assetKey).toBe("ethereum:evm:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(stellarUsdc.assetKey).toBe(
      "stellar-pubnet:stellar:classic:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    );
    expect(unrelatedUsdc.assetKey).toBe("ethereum:evm:0x1111111111111111111111111111111111111111");

    expect(ethUsdc.assetKey).not.toBe(stellarUsdc.assetKey);
    expect(ethUsdc.assetKey).not.toBe(unrelatedUsdc.assetKey);
  });

  it("safely handles unpriced holdings without crashing or corrupting balances", () => {
    const adapted = adaptHoldings(PARTIAL_PRICES_UNRESOLVED_HOLDINGS);
    const unpriced = adapted.find((h) => h.symbol === "UNPRICED");

    expect(unpriced).toBeDefined();
    expect(unpriced?.priceStatus).toBe("unavailable");
    expect(unpriced?.priceUsd).toBeNull();
    expect(unpriced?.valueUsd).toBe(0);
    expect(unpriced?.balance).toBe(10000);
  });
});

describe("Exposure Map Domain: Graph Traversal & Cycle Guard", () => {
  it("detects and severs cyclic relationships deterministically", () => {
    const adapted = adaptHoldings(NESTED_CYCLE_HOLDINGS);
    const normalized = normalizeRelationships(NESTED_CYCLE_CUSTOM_RELATIONSHIPS);
    const graph = buildDirectedGraph(adapted, normalized);

    expect(graph.cycles.length).toBeGreaterThan(0);
    const detected = graph.cycles[0];
    expect(detected.path).toContain("underlying:eth");
    expect(detected.severedEdge).toContain("underlying:eth->ethereum:evm:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0");
  });

  it("preserves acyclic edges when cycles are severed", () => {
    const adapted = adaptHoldings(NESTED_CYCLE_HOLDINGS);
    const normalized = normalizeRelationships(NESTED_CYCLE_CUSTOM_RELATIONSHIPS);
    const graph = buildDirectedGraph(adapted, normalized);

    const hasLidoEdge = graph.edges.some((e) => e.target === "protocol:lido");
    expect(hasLidoEdge).toBe(true);
  });
});

describe("Exposure Map Domain: Decimal Allocation & Double Counting Prevention", () => {
  it("groups shared issuer across multiple chains into a single entity exposure", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    const circleIssuer = result.groupedExposures.byIssuer.find(
      (item) => item.entityId === "issuer:circle"
    );

    expect(circleIssuer).toBeDefined();
    expect(circleIssuer?.exposureUsd).toBe(15000);
    expect(circleIssuer?.holdingCount).toBe(2);
    expect(circleIssuer?.distinctChains).toContain("ethereum");
    expect(circleIssuer?.distinctChains).toContain("stellar-pubnet");

    const unrelatedInCircle = circleIssuer?.sourceHoldings.some(
      (h) => h.assetKey.includes("0x1111111111111111111111111111111111111111")
    );
    expect(unrelatedInCircle).toBe(false);
  });

  it("prevents double counting on multi-path nested dependencies", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: NESTED_CYCLE_HOLDINGS,
      customRelationships: NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
    });

    const lidoProtocol = result.groupedExposures.byProtocol.find(
      (p) => p.entityId === "protocol:lido"
    );

    expect(lidoProtocol).toBeDefined();
    expect(lidoProtocol?.exposureUsd).toBe(2000);
    expect(result.coverage.totalPortfolioValueUsd).toBe(2000);
  });

  it("distinguishes direct holdings from look-through underlying exposures", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: NESTED_CYCLE_HOLDINGS,
    });

    const ethUnderlying = result.groupedExposures.byUnderlying.find(
      (u) => u.entityId === "underlying:eth"
    );

    expect(ethUnderlying).toBeDefined();
    expect(ethUnderlying?.lookThroughValueUsd).toBe(2000);
    expect(ethUnderlying?.directValueUsd).toBe(0);
  });
});

describe("Exposure Map Domain: Concentration Risk Calculation", () => {
  it("computes accurate HHI and classifies high concentration", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    expect(result.concentration.hhi).toBeGreaterThanOrEqual(2500);
    expect(result.concentration.classification).toBe("high_concentration");
    expect(result.concentration.topEntityName).toBe("Circle");
    expect(result.concentration.dominantEntities.length).toBeGreaterThan(0);
  });

  it("computes well_diversified for empty portfolio", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: EMPTY_PORTFOLIO_HOLDINGS,
    });

    expect(result.concentration.hhi).toBe(0);
    expect(result.concentration.classification).toBe("well_diversified");
    expect(result.concentration.topEntitySharePercent).toBe(0);
  });
});

describe("Exposure Map Domain: Coverage Gaps & Integrity", () => {
  it("flags partial coverage when unpriced or unresolved holdings exist", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: PARTIAL_PRICES_UNRESOLVED_HOLDINGS,
    });

    expect(result.coverage.coverageStatus).toBe("partial");
    expect(result.coverage.totalHoldingsCount).toBe(3);
    expect(result.coverage.pricedHoldingsCount).toBe(2);
    expect(result.coverage.unpricedHoldingsCount).toBe(1);
    expect(result.coverage.unresolvedHoldingsCount).toBe(2);

    expect(result.coverage.unpricedHoldings[0].symbol).toBe("UNPRICED");
    const unresolvedSymbols = result.coverage.unresolvedHoldings.map((h) => h.symbol);
    expect(unresolvedSymbols).toContain("UNPRICED");
    expect(unresolvedSymbols).toContain("MYSTERY");

    expect(result.coverage.knownValueCoverageRatio).toBe(0.7143);
  });

  it("flags unavailable coverage for empty portfolio", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: EMPTY_PORTFOLIO_HOLDINGS,
    });

    expect(result.coverage.coverageStatus).toBe("unavailable");
    expect(result.coverage.totalHoldingsCount).toBe(0);
    expect(result.coverage.knownValueCoverageRatio).toBe(0);
  });
});
