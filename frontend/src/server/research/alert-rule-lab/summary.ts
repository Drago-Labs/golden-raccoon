import type { TimelineItem } from "./schema";
import { countMatches } from "./timeline";
export function summarize(draft: TimelineItem[], saved: TimelineItem[] | null) { const draftAlerts = countMatches(draft); const savedAlerts = saved ? countMatches(saved) : null; return { draftAlerts, savedAlerts, delta: savedAlerts === null ? null : draftAlerts - savedAlerts, coverage: draft.length ? draft.filter((item) => item.outcome !== "missing").length / draft.length : 1 }; }
