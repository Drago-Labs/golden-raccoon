import { describe, expect, it } from "vitest";
import { buildRegionalNewsReport, dedupeByCanonical, normalizeFeedItem, translateArticle } from "@/server/research/regional-news";
import { multilingualFeeds } from "./fixtures";

describe("regional news domain", () => {
  it("keeps original text beside translations and marks low confidence", () => {
    const ok = translateArticle({ title: "タイトル", summary: "要約", language: "ja" });
    expect(ok.originalTitle).toBe("タイトル");
    expect(ok.translatedTitle).toContain("タイトル");
    expect(ok.state).toBe("ok");

    const low = translateArticle({ title: "제목", summary: null, language: "ko" }, { confidence: 0.4 });
    expect(low.needsManualReview).toBe(true);
    expect(low.state).toBe("low_confidence");
    expect(low.originalTitle).toBe("제목");
  });

  it("drops items without canonical links", () => {
    expect(normalizeFeedItem({ title: "x" }, "src")).toBeNull();
    expect(normalizeFeedItem({ title: "x", link: "https://ok.example/a" }, "src")?.canonicalUrl).toBe("https://ok.example/a");
  });

  it("does not count syndicated duplicates as independent coverage", async () => {
    const report = await buildRegionalNewsReport(
      { observedAt: "2026-09-01T12:00:00.000Z" },
      {
        fetchFeed: async (source) => multilingualFeeds[source.id] ?? [],
      },
    );
    expect(report.coverage.duplicateSyndicationCount).toBeGreaterThan(0);
    expect(report.articles.filter((article) => article.canonicalUrl.includes("wire-copy")).length).toBe(0);
    expect(report.scoreUnchanged).toBe(true);
  });

  it("never invents asset refs from ticker alone", async () => {
    const report = await buildRegionalNewsReport(
      { symbol: "USDC", observedAt: "2026-09-01T12:00:00.000Z" },
      { fetchFeed: async (source) => multilingualFeeds[source.id] ?? [] },
    );
    expect(report.articles.every((article) => article.assetRefs.length === 0)).toBe(true);
  });

  it("attaches asset refs only with chain and contract evidence", async () => {
    const report = await buildRegionalNewsReport(
      {
        symbol: "USDC",
        chain: "ethereum",
        contractOrIssuer: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        observedAt: "2026-09-01T12:00:00.000Z",
      },
      { fetchFeed: async (source) => multilingualFeeds[source.id] ?? [] },
    );
    expect(report.articles.some((article) => article.assetRefs.length === 1)).toBe(true);
  });

  it("marks failed sources without fabricating articles", async () => {
    const report = await buildRegionalNewsReport(
      { observedAt: "2026-09-01T12:00:00.000Z" },
      {
        fetchFeed: async (source) => {
          if (source.id === "hankyung-ko") throw new Error("timeout");
          return multilingualFeeds[source.id] ?? [];
        },
      },
    );
    expect(report.coverage.failedSourceCount).toBe(1);
    expect(report.sources.find((source) => source.id === "hankyung-ko")?.health).toBe("failed");
    expect(report.articles.every((article) => article.sourceId !== "hankyung-ko")).toBe(true);
  });

  it("dedupes by syndication key", () => {
    const { unique, duplicateCount } = dedupeByCanonical([
      { canonicalUrl: "https://a.example/1", syndicationOf: null },
      { canonicalUrl: "https://b.example/2", syndicationOf: "https://a.example/1" },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicateCount).toBe(1);
  });
});
