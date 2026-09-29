import type { TimelineItem } from "./schema";
export function countMatches(items: TimelineItem[]) { return items.filter((item) => item.outcome === "match").length; }
