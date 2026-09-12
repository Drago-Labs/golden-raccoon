import { describe, it, expect } from "vitest";
import { previewRuleEvaluation } from "../preview";
import { validCurrentV2Rules } from "../__fixtures__/legacy-rules";

describe("Strategy Rule Preview Engine", () => {
  const base = validCurrentV2Rules[0];

  const sampleSignals = [
    {
      id: "sig-1",
      symbol: "ETH",
      chain: "base",
      riskScore: 25,
      liquidityUsd: 100000,
      categories: ["defi"],
      assetKey: "evm:base:0xeth1",
    },
    {
      id: "sig-2",
      symbol: "MEME",
      chain: "base",
      riskScore: 35,
      liquidityUsd: 50000,
      categories: ["meme"],
      assetKey: "evm:base:0xmeme1",
    },
    {
      id: "sig-3",
      symbol: "RISKY",
      chain: "base",
      riskScore: 90,
      liquidityUsd: 80000,
      categories: ["defi"],
      assetKey: "evm:base:0xrisky1",
    },
    {
      id: "sig-4",
      symbol: "XLM",
      chain: "stellar-testnet",
      riskScore: 15,
      liquidityUsd: 30000,
      categories: ["payment"],
      assetKey: "stellar:native:XLM",
    },
  ];

  it("matches signals satisfying candidate limits and filters blocked ones", () => {
    const preview = previewRuleEvaluation(base, sampleSignals);

    expect(preview.totalSignals).toBe(4);
    expect(preview.matchedCount).toBe(2);
    expect(preview.zeroMatches).toBe(false);

    const matchedSymbols = preview.matched.map((s) => s.symbol);
    expect(matchedSymbols).toContain("ETH");
    expect(matchedSymbols).toContain("XLM");

    const blockedMeme = preview.blocked.find((b) => b.signal.symbol === "MEME");
    expect(blockedMeme?.reason).toContain("Blocked category");

    const blockedRisky = preview.blocked.find((b) => b.signal.symbol === "RISKY");
    expect(blockedRisky?.reason).toContain("Risk score");
  });

  it("reports zeroMatches: true when candidate rule matches no signals", () => {
    const superStrict = {
      ...base,
      maxBuyRisk: 5,
      minLiquidityUsd: 10000000,
    };
    const preview = previewRuleEvaluation(superStrict, sampleSignals);

    expect(preview.matchedCount).toBe(0);
    expect(preview.zeroMatches).toBe(true);
    expect(preview.blocked).toHaveLength(4);
  });

  it("filters signals by chain allowlist", () => {
    const onlyStellar = {
      ...base,
      allowedChains: ["stellar-testnet"],
    };
    const preview = previewRuleEvaluation(onlyStellar, sampleSignals);

    const blockedChains = preview.blocked.filter((b) => b.reason.includes("Chain not allowed"));
    expect(blockedChains.length).toBeGreaterThanOrEqual(2);
  });
});
