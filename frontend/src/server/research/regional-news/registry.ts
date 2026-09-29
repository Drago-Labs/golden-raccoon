import type { RegionalSource } from "./schema";

/** Reviewed registry — configured ≠ successfully fetched. */
export const REGIONAL_SOURCE_REGISTRY: RegionalSource[] = [
  { id: "nikkei-ja", publisher: "Nikkei", language: "ja", region: "JP", feedType: "rss", feedUrl: "fixture://nikkei", health: "configured" },
  { id: "folha-pt", publisher: "Folha", language: "pt", region: "BR", feedType: "rss", feedUrl: "fixture://folha", health: "configured" },
  { id: "hankyung-ko", publisher: "Hankyung", language: "ko", region: "KR", feedType: "atom", feedUrl: "fixture://hankyung", health: "configured" },
  { id: "coindesk-en", publisher: "CoinDesk", language: "en", region: "US", feedType: "rss", feedUrl: "fixture://coindesk", health: "configured" },
];
