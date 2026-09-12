import { describe, expect, it } from "vitest";
import { canonicalizeUrl, outletIdFor } from "@/server/research/news-lineage/canonicalLinks";
import { sanitizeText } from "@/server/research/news-lineage/articleAdapter";
import { LineageError } from "@/server/research/news-lineage/schema";
import { analyseLineage } from "@/server/research/news-lineage/service";
import {
  correctionsMissingEventTime,
  emptyEvidence,
  multilingualSparseAdversarial,
  sameCanonicalUrl,
  sameOutletRepeat,
  similarTitlesDistinctBodies,
  syndicatedAndIndependentReports,
} from "./fixtures";

function clusterFor(report: ReturnType<typeof analyseLineage>, articleId: string) {
  return report.clusters.find((cluster) => cluster.members.some((member) => member.articleId === articleId));
}

describe("syndication", () => {
  it("collapses syndicated copies across domains into one lineage", () => {
    const report = analyseLineage(syndicatedAndIndependentReports);
    const wire = clusterFor(report, "wire-origin");

    expect(wire?.members.map((member) => member.articleId).sort()).toEqual(
      ["syndicated-a", "syndicated-b", "wire-origin"].sort(),
    );
    expect(wire?.strongestReason).toBe("declared_syndication");
  });

  it("keeps a genuinely independent report in its own lineage", () => {
    const report = analyseLineage(syndicatedAndIndependentReports);

    expect(report.clusters).toHaveLength(2);
    expect(clusterFor(report, "independent")?.members).toHaveLength(1);
  });

  it("does not let three copies raise the corroboration count", () => {
    const report = analyseLineage(syndicatedAndIndependentReports);
    const wireSummary = report.corroboration.find((entry) => entry.clusterId === clusterFor(report, "wire-origin")?.clusterId);

    expect(wireSummary?.independentReportCount).toBe(1);
    expect(wireSummary?.state).toBe("syndication_only");
    expect(wireSummary?.note).toMatch(/single report, not 3 confirmations/i);
  });

  it("does not collapse independent reports that merely share a headline", () => {
    const report = analyseLineage(similarTitlesDistinctBodies);

    expect(report.clusters).toHaveLength(2);
  });

  it("treats the same canonical URL as one article", () => {
    const report = analyseLineage(sameCanonicalUrl);

    expect(report.clusters).toHaveLength(1);
    expect(report.clusters[0].strongestReason).toBe("same_canonical_url");
  });

  it("records a reason on every cluster decision", () => {
    const report = analyseLineage(syndicatedAndIndependentReports);

    for (const cluster of report.clusters) {
      for (const member of cluster.members) {
        expect(member.reason).toBeTruthy();
        expect(member.detail.length).toBeGreaterThan(10);
      }
    }
  });

  it("counts one outlet publishing twice as one outlet", () => {
    const report = analyseLineage(sameOutletRepeat);
    const summary = report.corroboration[0];

    expect(summary.independentReportCount).toBe(1);
    expect(report.articles.find((article) => article.articleId === "repeat-second")?.role).toBe("same_outlet_repeat");
  });
});

describe("canonicalization", () => {
  it("strips tracking parameters, fragments and www", () => {
    expect(canonicalizeUrl("https://www.wire.example/news/x/?utm_campaign=a&fbclid=b#top")).toBe(
      "https://wire.example/news/x",
    );
  });

  it("refuses a non-web scheme", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("data:text/html,<script>")).toBeNull();
  });

  it("reads a bare domain as an outlet attribution", () => {
    expect(outletIdFor("wire.example")).toBe("wire.example");
    expect(outletIdFor("https://www.wire.example/x")).toBe("wire.example");
    expect(outletIdFor("not a domain")).toBeNull();
  });
});

describe("chronology", () => {
  it("separates event time from publication time", () => {
    const report = analyseLineage(correctionsMissingEventTime);
    const original = report.timeline.find((entry) => entry.articleId === "original-claim");
    const correction = report.timeline.find((entry) => entry.articleId === "the-correction");

    expect(original?.kind).toBe("event");
    expect(original?.at).toBe("2026-01-05T05:00:00.000Z");
    expect(correction?.kind).toBe("publication");
    expect(correction?.uncertainty).toMatch(/does not distinguish/i);
  });

  it("places an undated article nowhere rather than dating it", () => {
    const report = analyseLineage(correctionsMissingEventTime);
    const undated = report.timeline.find((entry) => entry.articleId === "undated");

    expect(undated?.kind).toBe("unknown");
    expect(undated?.at).toBeNull();
    expect(undated?.uncertainty).toMatch(/cannot be placed in the chronology/i);
  });

  it("flags a future timestamp as a data problem", () => {
    const report = analyseLineage(correctionsMissingEventTime);
    const future = report.timeline.find((entry) => entry.articleId === "future-dated");

    expect(future?.uncertainty).toMatch(/data problem, not a scheduled future report/i);
    expect(report.coverage.futureTimestampCount).toBe(1);
  });

  it("recognises a declared correction and resolves it to the original", () => {
    const report = analyseLineage(correctionsMissingEventTime);
    const correction = report.timeline.find((entry) => entry.articleId === "the-correction");

    expect(correction?.isCorrection).toBe(true);
    expect(report.coverage.correctionCount).toBe(1);
  });

  it("orders dated entries and keeps undated ones in a stable tail", () => {
    const report = analyseLineage(correctionsMissingEventTime);
    const dated = report.timeline.filter((entry) => entry.at !== null).map((entry) => entry.at!);
    const undatedIndex = report.timeline.findIndex((entry) => entry.at === null);

    expect(dated).toEqual([...dated].sort());
    expect(undatedIndex).toBe(report.timeline.length - 1);
  });
});

describe("multilingual, sparse and adversarial text", () => {
  it("tokenizes non-Latin scripts rather than calling them sparse", () => {
    const report = analyseLineage(multilingualSparseAdversarial);
    const turkish = report.articles.find((article) => article.articleId === "turkish");

    expect(turkish?.tokenCount).toBeGreaterThan(12);
  });

  it("refuses to cluster on text when an article is headline-only", () => {
    const report = analyseLineage(multilingualSparseAdversarial);
    const sparse = report.articles.find((article) => article.articleId === "headline-only");

    expect(sparse?.role).not.toBe("independent");
    expect(report.coverage.sparseTextCount).toBeGreaterThan(0);
  });

  it("strips markup and invisible characters from provider text", () => {
    const report = analyseLineage(multilingualSparseAdversarial);
    const adversarial = report.articles.find((article) => article.articleId === "adversarial");

    expect(adversarial?.title).not.toContain("<script>");
    expect(adversarial?.title).not.toContain("‮");
    expect(adversarial?.summary).not.toContain("<b>");
  });

  it("records undeclared language as uncertainty", () => {
    const report = analyseLineage(multilingualSparseAdversarial);

    expect(report.coverage.undeclaredLanguageCount).toBe(2);
    const entry = report.timeline.find((item) => item.articleId === "adversarial");
    expect(entry?.uncertainty).toMatch(/declares no language/i);
  });

  it("sanitizes text without leaving markup behind", () => {
    expect(sanitizeText("<p>hello <b>world</b></p>")).toBe("hello world");
    expect(sanitizeText("a​b")).toBe("ab");
  });
});

describe("corroboration counting", () => {
  it("never treats unknown provenance as independent", () => {
    const report = analyseLineage(multilingualSparseAdversarial);
    const unknown = report.articles.filter((article) => article.role === "unknown_provenance");

    for (const article of unknown) {
      expect(article.roleReason).toMatch(/never as independent|has not been determined/i);
    }
  });

  it("requires two independent outlets for corroboration", () => {
    const report = analyseLineage(similarTitlesDistinctBodies);

    // Two separate lineages, each with one outlet.
    for (const summary of report.corroboration) {
      expect(summary.state).toBe("single_outlet");
      expect(summary.note).toMatch(/not evidence against it/i);
    }
  });

  it("says a single outlet is an absence of corroboration, not a negative", () => {
    const report = analyseLineage(similarTitlesDistinctBodies);

    expect(report.corroboration[0].note).toMatch(/absence of corroboration/i);
  });
});

describe("score independence", () => {
  it("declares that no score was changed", () => {
    expect(analyseLineage(syndicatedAndIndependentReports).scoreUnchanged).toBe(true);
  });

  it("emits no score-shaped field", () => {
    const report = analyseLineage(syndicatedAndIndependentReports);
    const keys = new Set<string>();

    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key.toLowerCase());
          walk(child);
        }
      }
    };

    walk(report);

    for (const forbidden of ["score", "riskscore", "credibility", "confidence", "verdict"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(syndicatedAndIndependentReports);
    analyseLineage(syndicatedAndIndependentReports);
    expect(JSON.stringify(syndicatedAndIndependentReports)).toBe(before);
  });
});

describe("coverage states", () => {
  it("distinguishes complete, partial and empty", () => {
    expect(analyseLineage(syndicatedAndIndependentReports).coverage.state).toBe("complete");
    expect(analyseLineage(multilingualSparseAdversarial).coverage.state).toBe("partial");
    expect(analyseLineage(emptyEvidence).coverage.state).toBe("empty");
  });

  it("treats empty evidence as a valid result", () => {
    const report = analyseLineage(emptyEvidence);

    expect(report.clusters).toHaveLength(0);
    expect(report.coverage.note).toMatch(/no lineage to build/i);
  });
});

describe("validation", () => {
  it("rejects an unreadable observation time", () => {
    expect(() => analyseLineage({ observedAt: "not-a-date", articles: [] })).toThrow(LineageError);
  });

  it("rejects an article with no title", () => {
    expect(() =>
      analyseLineage({ observedAt: "2026-01-05T12:00:00.000Z", articles: [{ articleId: "x", title: "" }] }),
    ).toThrow(LineageError);
  });
});
