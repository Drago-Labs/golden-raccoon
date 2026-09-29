import type { FeedItem } from "@/server/research/regional-news/normalize";

export const multilingualFeeds: Record<string, FeedItem[]> = {
  "nikkei-ja": [
    {
      title: "ステーブルコイン規制が拡大",
      link: "https://nikkei.example/a1",
      summary: "概要",
      publishedAt: "2026-09-01T10:00:00Z",
      language: "ja",
    },
  ],
  "folha-pt": [
    {
      title: "Token sobe após anúncio",
      link: "https://folha.example/b1",
      summary: "resumo",
      publishedAt: "2026-09-01T11:00:00Z",
      language: "pt",
    },
    {
      title: "Copy of Nikkei wire",
      link: "https://folha.example/wire-copy",
      summary: "syndicated",
      publishedAt: "2026-09-01T12:00:00Z",
      language: "pt",
      syndicatedFrom: "https://nikkei.example/a1",
    },
  ],
  "hankyung-ko": [
    {
      title: "Missing link item",
      summary: "no url",
      language: "ko",
    },
  ],
  "coindesk-en": [
    {
      title: "USDC expands in Asia",
      link: "https://coindesk.example/c1",
      summary: "English source",
      publishedAt: "2026-09-01T09:00:00Z",
      language: "en",
    },
  ],
};

export const failingFeedIds = ["hankyung-ko"];
