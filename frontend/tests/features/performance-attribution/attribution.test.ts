import { describe, expect, it } from "vitest";
import {
  attributeAssets,
  formatAssetContributions,
  marketTotal,
} from "@/server/research/performance-attribution/assetAttribution";
import { attributeChains } from "@/server/research/performance-attribution/chainAttribution";
import { parseUsd } from "@/server/research/performance-attribution/decimalMath";
import { normalized, USDC, WETH } from "./fixtures";

const steady = normalized("steadyPortfolio");
const deposit = normalized("largeDeposit");
const missing = normalized("missingPrices");

describe("attributeAssets: market movement with no flows", () => {
  const rows = attributeAssets(steady[0], steady[1], new Map());

  it("attributes the whole change to the price effect when nothing entered or left", () => {
    // WETH: 10 units from 2,000 to 2,200 is +2,000, all of it the price effect.
    expect(rows.find((row) => row.key === WETH)).toMatchObject({
      startValue: parseUsd("20000"),
      endValue: parseUsd("22000"),
      change: parseUsd("2000"),
      flow: 0n,
      market: parseUsd("2000"),
      priceEffect: parseUsd("2000"),
      residual: 0n,
    });
  });

  it("states a flat asset as zero rather than leaving it out", () => {
    expect(rows.find((row) => row.key === USDC)).toMatchObject({ change: 0n, market: 0n, priceEffect: 0n, residual: 0n });
  });

  it("sums the assets into the period's market movement", () => {
    expect(marketTotal(rows)).toBe(parseUsd("2000"));
  });
});

describe("attributeAssets: a deposit mid-period", () => {
  // 10,000 USD of WETH arrived mid-period; the wallet went from 10 to 15 units
  // while the price went from 2,000 to 2,100.
  const flows = new Map([["ethereum:weth", parseUsd("10000")]]);
  const rows = attributeAssets(deposit[0], deposit[1], flows);
  const weth = rows.find((row) => row.key === WETH)!;

  it("never counts the deposit as a return", () => {
    expect(weth.change).toBe(parseUsd("11500"));
    expect(weth.flow).toBe(parseUsd("10000"));
    expect(weth.market).toBe(parseUsd("1500"));
  });

  it("splits market movement into the price effect on units held at the start and a residual", () => {
    // 10 units × 100 = 1,000 on the units held at the start; the remaining 500
    // is the same 100 move on the 5 units acquired during the period.
    expect(weth.priceEffect).toBe(parseUsd("1000"));
    expect(weth.residual).toBe(parseUsd("500"));
  });

  it("adds flow, price effect and residual back to the observed change exactly", () => {
    expect(weth.flow + (weth.priceEffect as bigint) + (weth.residual as bigint)).toBe(weth.change);
  });

  it("matches a flow to the holding whether it is named by contract or by symbol", () => {
    const byKey = attributeAssets(deposit[0], deposit[1], new Map([[WETH, parseUsd("10000")]]));
    expect(byKey.find((row) => row.key === WETH)?.market).toBe(parseUsd("1500"));
    expect(byKey).toHaveLength(rows.length);
  });

  it("keeps a flow whose asset is in no observation as its own row, explained", () => {
    const rowsWithStranger = attributeAssets(deposit[0], deposit[1], new Map([["ethereum:dai", parseUsd("250")]]));
    const stranger = rowsWithStranger.find((row) => row.key === "ethereum:dai")!;
    expect(stranger).toMatchObject({ flow: parseUsd("250"), market: parseUsd("-250"), chain: "ethereum", symbol: "dai" });
    expect(stranger.notes.join(" ")).toMatch(/not an observed loss/);
  });
});

describe("attributeAssets: missing prices", () => {
  const rows = attributeAssets(missing[0], missing[1], new Map());

  it("reports an asset with no end price as unavailable rather than as a total loss", () => {
    const goat = rows.find((row) => row.key !== WETH)!;
    expect(goat.endValue).toBeNull();
    expect(goat.change).toBeNull();
    expect(goat.market).toBeNull();
    expect(goat.notes.join(" ")).toMatch(/No usable price at the end/);
  });

  it("withholds the period's market total when any asset could not be attributed", () => {
    expect(marketTotal(rows)).toBeNull();
  });

  it("still attributes the assets that were priced on both sides", () => {
    expect(rows.find((row) => row.key === WETH)).toMatchObject({ market: parseUsd("1000"), priceEffect: parseUsd("1000") });
  });
});

describe("formatAssetContributions", () => {
  it("renders every figure as a decimal string and states each asset's share of the market", () => {
    const rows = attributeAssets(steady[0], steady[1], new Map());
    const contributions = formatAssetContributions(rows, marketTotal(rows));
    expect(contributions.find((row) => row.key === WETH)).toMatchObject({
      changeUsd: "2000",
      externalFlowUsd: "0",
      marketUsd: "2000",
      priceEffectUsd: "2000",
      residualUsd: "0",
      marketShareBps: "10000",
      state: "complete",
    });
    expect(contributions.find((row) => row.key === USDC)?.marketShareBps).toBe("0");
  });

  it("marks an asset that could not be attributed as partial with nulls, not zeros", () => {
    const rows = attributeAssets(missing[0], missing[1], new Map());
    const contributions = formatAssetContributions(rows, marketTotal(rows));
    const goat = contributions.find((row) => row.key !== WETH)!;
    expect(goat).toMatchObject({ state: "partial", changeUsd: null, marketUsd: null, marketShareBps: null });
  });
});

describe("attributeChains", () => {
  it("rolls assets up by chain", () => {
    const rows = attributeAssets(steady[0], steady[1], new Map());
    expect(attributeChains(rows, marketTotal(rows))).toEqual([
      {
        chain: "ethereum",
        externalFlowUsd: "0",
        marketUsd: "2000",
        priceEffectUsd: "2000",
        residualUsd: "0",
        marketShareBps: "10000",
        state: "complete",
      },
    ]);
  });

  it("keeps each chain's flows separate", () => {
    const rows = attributeAssets(deposit[0], deposit[1], new Map([["ethereum:weth", parseUsd("10000")], ["base:usdc", parseUsd("400")]]));
    const chains = attributeChains(rows, marketTotal(rows));
    expect(chains.map((chain) => [chain.chain, chain.externalFlowUsd])).toEqual([
      ["base", "400"],
      ["ethereum", "10000"],
    ]);
  });

  it("reports a chain holding an unattributable asset as partial", () => {
    const rows = attributeAssets(missing[0], missing[1], new Map());
    const [chain] = attributeChains(rows, marketTotal(rows));
    expect(chain).toMatchObject({ chain: "ethereum", state: "partial", marketUsd: null });
  });
});
