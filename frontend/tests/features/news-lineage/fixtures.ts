/**
 * Fixtures for story lineage analysis.
 *
 * Each fixture isolates one claim the feature makes: that syndication is not
 * corroboration, that similar headlines are not grounds for collapsing reports,
 * and that missing or contradictory timing preserves uncertainty. Nothing here
 * touches a network.
 */
import type { LineageRequest } from "@/server/research/news-lineage/schema";

const OBSERVED_AT = "2026-01-05T12:00:00.000Z";

const WIRE_BODY =
  "The issuer announced a scheduled audit of its reserve holdings covering the fourth quarter, with results expected to be published by an independent accounting firm before the end of the month.";

const INDEPENDENT_BODY =
  "Reporters reviewed filings showing the reserve audit was commissioned in November, several weeks earlier than the issuer stated, and spoke to two people familiar with the arrangement.";

/**
 * One wire story republished on three domains with declared attribution, plus
 * one genuinely independent report from a fourth outlet.
 */
export const syndicatedAndIndependentReports: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "wire-origin",
      originalId: "provider-1001",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://wire.example/news/reserve-audit",
      canonicalUrl: "https://wire.example/news/reserve-audit",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "en",
    },
    {
      articleId: "syndicated-a",
      originalId: "provider-1002",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://alpha-news.example/finance/reserve-audit?utm_source=feed",
      syndicatedFrom: "wire.example",
      publishedAt: "2026-01-05T08:30:00.000Z",
      language: "en",
    },
    {
      articleId: "syndicated-b",
      originalId: "provider-1003",
      title: "Reserve audit scheduled by issuer",
      summary: WIRE_BODY,
      url: "https://beta-press.example/markets/reserve-audit",
      syndicatedFrom: "https://wire.example",
      publishedAt: "2026-01-05T09:00:00.000Z",
      language: "en",
    },
    {
      articleId: "independent",
      originalId: "provider-1004",
      title: "Reserve audit was commissioned earlier than issuer said",
      summary: INDEPENDENT_BODY,
      url: "https://gamma-review.example/investigations/reserve-audit",
      publishedAt: "2026-01-05T10:00:00.000Z",
      language: "en",
    },
  ],
};

/**
 * Two outlets with near-identical headlines but genuinely different bodies.
 * They must not be collapsed.
 */
export const similarTitlesDistinctBodies: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "similar-a",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://alpha-news.example/a",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "en",
    },
    {
      articleId: "similar-b",
      title: "Issuer schedules reserve audit",
      summary: INDEPENDENT_BODY,
      url: "https://beta-press.example/b",
      publishedAt: "2026-01-05T09:00:00.000Z",
      language: "en",
    },
  ],
};

/** The same article reached by a share link and a direct link. */
export const sameCanonicalUrl: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "canonical-direct",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://wire.example/news/reserve-audit",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "en",
    },
    {
      articleId: "canonical-shared",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://www.wire.example/news/reserve-audit/?utm_campaign=share&fbclid=abc#top",
      publishedAt: "2026-01-05T08:05:00.000Z",
      language: "en",
    },
  ],
};

/**
 * A declared correction, an article with no publication time, one with a
 * future timestamp, and one whose event time precedes publication.
 */
export const correctionsMissingEventTime: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "original-claim",
      originalId: "provider-2001",
      title: "Issuer reports a shortfall in reserves",
      summary: INDEPENDENT_BODY,
      url: "https://alpha-news.example/original",
      publishedAt: "2026-01-05T06:00:00.000Z",
      eventAt: "2026-01-05T05:00:00.000Z",
      language: "en",
    },
    {
      articleId: "the-correction",
      originalId: "provider-2002",
      title: "Correction: the reserve figure was misstated",
      summary:
        "An earlier report misstated the reserve figure by a factor of ten. The corrected figure is stated below along with the source of the error.",
      url: "https://alpha-news.example/correction",
      publishedAt: "2026-01-05T07:00:00.000Z",
      correctionOf: "provider-2001",
      language: "en",
    },
    {
      articleId: "undated",
      title: "Analysts weigh the reserve disclosure",
      summary:
        "Several analysts published notes on the disclosure, disagreeing about whether the revised figure changes the issuer risk profile in any material way.",
      url: "https://beta-press.example/undated",
      language: "en",
    },
    {
      articleId: "future-dated",
      title: "Follow-up on the reserve disclosure",
      summary:
        "A follow-up piece reviewing the disclosure and the correction that followed it, with comment from the accounting firm involved in the review.",
      url: "https://gamma-review.example/future",
      publishedAt: "2026-06-01T00:00:00.000Z",
      language: "en",
    },
  ],
};

/**
 * Non-Latin scripts, a headline-only article, and text carrying invisible
 * bidirectional-override characters and markup.
 */
export const multilingualSparseAdversarial: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "turkish",
      title: "Ihracatci rezerv denetimi planladi",
      summary:
        "Ihracatci dorduncu ceyregi kapsayan rezerv varliklarinin denetimini planladigini duyurdu ve sonuclarin bagimsiz bir muhasebe firmasi tarafindan ay sonundan once yayimlanmasi bekleniyor.",
      url: "https://haber.example/rezerv-denetimi",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "tr",
    },
    {
      articleId: "headline-only",
      title: "Audit",
      url: "https://sparse.example/a",
      publishedAt: "2026-01-05T08:10:00.000Z",
    },
    {
      articleId: "adversarial",
      title: "<script>alert(1)</script>Issuer\u202Eschedules\u202C reserve audit",
      summary: `<b>${"Bold"}</b> ${WIRE_BODY}`,
      url: "https://alpha-news.example/adversarial",
      publishedAt: "2026-01-05T08:20:00.000Z",
    },
  ],
};

/** Valid request carrying no articles. */
export const emptyEvidence: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [],
};

/** One outlet publishing twice about the same story. */
export const sameOutletRepeat: LineageRequest = {
  observedAt: OBSERVED_AT,
  articles: [
    {
      articleId: "repeat-first",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://alpha-news.example/first",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "en",
    },
    {
      // Same outlet, same story, republished at a second URL. The bodies match,
      // so these cluster; the same-outlet rule is what keeps the count at one.
      articleId: "repeat-second",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://alpha-news.example/second",
      publishedAt: "2026-01-05T09:00:00.000Z",
      language: "en",
    },
  ],
};
