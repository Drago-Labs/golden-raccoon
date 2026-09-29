import { describe, expect, it } from "vitest";
import { assetKeyFor } from "@/server/research/spam-dust-review/keys";
import { reviewSpamDust } from "@/server/research/spam-dust-review/service";
import {
  emptyWallet,
  falsePositiveVerified,
  highValueUnpriced,
  preferenceRoundTrip,
  providerFailure,
  sameSymbolDifferentChains,
  spamLikeFixtures,
} from "./fixtures";

describe("classification", () => {
  it("flags spam-like and dust holdings with explainable signals", () => {
    const report = reviewSpamDust(spamLikeFixtures);
    const airdrop = report.holdings.find((holding) => holding.symbol === "AIRDROP");
    const dust = report.holdings.find((holding) => holding.symbol === "DUST");
    const usdc = report.holdings.find((holding) => holding.symbol === "USDC");

    expect(airdrop?.signals.some((signal) => signal.kind === "unknown_issuer")).toBe(true);
    expect(airdrop?.signals.some((signal) => signal.kind === "suspicious_link")).toBe(true);
    expect(dust?.signals.some((signal) => signal.kind === "tiny_value")).toBe(true);
    expect(usdc?.signals).toHaveLength(0);
    expect(report.portfolioUnchanged).toBe(true);
  });

  it("does not treat a high-value unpriced asset as dust", () => {
    const report = reviewSpamDust(highValueUnpriced);
    const rare = report.holdings[0];

    expect(rare.signals.map((signal) => signal.kind)).toEqual(["unpriced"]);
    expect(rare.signals.some((signal) => signal.kind === "tiny_value")).toBe(false);
    expect(rare.signals[0]?.detail).toMatch(/not treated as dust/i);
  });

  it("does not flag a verified priced asset as a false positive", () => {
    const report = reviewSpamDust(falsePositiveVerified);
    expect(report.holdings[0].signals).toHaveLength(0);
    expect(report.coverage.state).toBe("complete");
  });
});

describe("preferences and identity", () => {
  it("keeps same-symbol assets on different networks on separate keys", () => {
    const report = reviewSpamDust(sameSymbolDifferentChains);
    const keys = report.holdings.map((holding) => holding.assetKey);

    expect(new Set(keys).size).toBe(2);
    expect(report.holdings.filter((holding) => holding.hidden)).toHaveLength(1);
    expect(report.holdings.find((holding) => holding.chainId === "ethereum")?.hidden).toBe(false);
  });

  it("round-trips hide preferences and keeps hidden assets discoverable", () => {
    const report = reviewSpamDust(preferenceRoundTrip);
    const dust = report.holdings[0];

    expect(dust.hidden).toBe(true);
    expect(report.uncertainty.hiddenHoldingCount).toBe(1);
    expect(report.uncertainty.note).toMatch(/remain discoverable/i);
    expect(report.preferenceExport.preferences[0]?.hidden).toBe(true);

    const shown = reviewSpamDust({
      ...preferenceRoundTrip,
      preferences: [{ assetKey: dust.assetKey, hidden: false, updatedAt: "2026-01-20T13:00:00.000Z" }],
    });
    expect(shown.holdings[0].hidden).toBe(false);
  });

  it("does not mutate the caller's holdings array", () => {
    const payload = structuredClone(spamLikeFixtures);
    const before = JSON.stringify(payload.holdings);
    reviewSpamDust(payload);
    expect(JSON.stringify(payload.holdings)).toBe(before);
  });

  it("builds chain-aware asset keys", () => {
    expect(
      assetKeyFor(
        { symbol: "USDC", name: "USD Coin", chainId: "ethereum", tokenAddress: "0xAbC", balance: 1 },
        "stellar-pubnet",
      ),
    ).toBe("ethereum|USDC|0xabc||");
  });
});

describe("coverage", () => {
  it("marks provider failure explicitly", () => {
    const report = reviewSpamDust(providerFailure);
    expect(report.coverage.state).toBe("provider_failed");
  });

  it("returns an empty coverage state", () => {
    const report = reviewSpamDust(emptyWallet);
    expect(report.coverage.state).toBe("empty");
  });
});
