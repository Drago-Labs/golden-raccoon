"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ArticleRef, ClaimTimelineEntry } from "@/server/research/news-lineage/schema";

const kindLabel = { event: "Event time", publication: "Publication time", unknown: "Not placeable" } as const;
const kindTone = { event: "success", publication: "neutral", unknown: "warning" } as const;

/**
 * Chronology of the claim.
 *
 * Event time and publication time are labelled distinctly, and an entry that
 * cannot be placed keeps its position at the end with the reason attached
 * rather than being given a time it does not have.
 */
export function ClaimTimeline({ timeline, articles }: { timeline: ClaimTimelineEntry[]; articles: ArticleRef[] }) {
  const byId = new Map(articles.map((article) => [article.articleId, article]));

  if (timeline.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        There is no article evidence to place on a chronology.
      </p>
    );
  }

  return (
    <ol className="space-y-2" data-testid="claim-timeline">
      {timeline.map((entry) => {
        const article = byId.get(entry.articleId);

        return (
          <li key={entry.articleId} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={kindTone[entry.kind]}>{kindLabel[entry.kind]}</StatusBadge>
              <span className="font-mono">{entry.at ?? "No usable timestamp"}</span>
              {entry.isCorrection ? <StatusBadge tone="warning">Correction</StatusBadge> : null}
            </span>
            <span className="mt-1 block">{article?.title}</span>
            <span className="block text-subtle">{article?.domain}</span>
            {entry.uncertainty ? <span className="mt-1 block text-[#f2c86d]">{entry.uncertainty}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
