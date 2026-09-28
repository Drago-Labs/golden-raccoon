import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionalNewsWorkspace } from "@/components/research/regional-news/RegionalNewsWorkspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RegionalNewsWorkspace", () => {
  it("exposes labelled controls and coverage tables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          report: {
            observedAt: "2026-09-01T12:00:00.000Z",
            sources: [{ id: "nikkei-ja", publisher: "Nikkei", language: "ja", region: "JP", feedType: "rss", feedUrl: "x", health: "healthy" }],
            articles: [
              {
                articleId: "1",
                sourceId: "nikkei-ja",
                canonicalUrl: "https://nikkei.example/a1",
                publishedAt: null,
                language: "ja",
                languageConfidence: 0.95,
                translation: {
                  originalTitle: "ステーブルコイン規制が拡大",
                  originalSummary: "概要",
                  translatedTitle: "[en] ステーブルコイン規制が拡大",
                  translatedSummary: "[en] 概要",
                  translator: "fixture-translator",
                  translatorVersion: "0.1.0",
                  confidence: 0.92,
                  state: "ok",
                  needsManualReview: false,
                },
                assetRefs: [],
                syndicationOf: null,
              },
            ],
            coverage: {
              languages: ["ja"],
              regions: ["JP"],
              healthySourceCount: 1,
              failedSourceCount: 0,
              untranslatedCount: 0,
              duplicateSyndicationCount: 0,
              note: "ok",
            },
            scoreUnchanged: true,
          },
        }),
      })),
    );

    render(<RegionalNewsWorkspace />);
    expect(screen.getByLabelText("Symbol")).toBeTruthy();
    expect(screen.getByLabelText("Chain")).toBeTruthy();
    expect(screen.getByLabelText("Contract or issuer")).toBeTruthy();
    const button = screen.getByRole("button", { name: /Load regional coverage/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("table", { name: /Regional source registry health/i })).toBeTruthy();
    });
    expect(screen.getByRole("table", { name: /original language and translation/i })).toBeTruthy();
    expect(screen.getByText("ステーブルコイン規制が拡大")).toBeTruthy();
    expect(screen.getByText(/Score unchanged: true/i)).toBeTruthy();
  });
});
