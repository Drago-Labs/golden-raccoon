export { regionalNewsRequestSchema, type RegionalNewsReport } from "./schema";
export { buildRegionalNewsReport, type FeedFetcher } from "./service";
export { REGIONAL_SOURCE_REGISTRY } from "./registry";
export { translateArticle } from "./translation";
export { normalizeFeedItem, dedupeByCanonical, type FeedItem } from "./normalize";
