"use client";

import type { RuleDiff } from "@/server/rules/diff";

export type RuleDiffListProps = {
  diff: RuleDiff | null;
  className?: string;
};

/**
 * Renders a structured diff between saved rule and pending edits.
 */
export function RuleDiffList({ diff, className = "" }: RuleDiffListProps) {
  if (!diff || !diff.hasChanges) {
    return (
      <div className={`rounded-md border border-white/10 bg-black/20 p-4 text-sm text-white/60 ${className}`}>
        No pending changes from saved rule.
      </div>
    );
  }

  return (
    <div className={`space-y-3 rounded-lg border border-white/15 bg-black/30 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">Pending Changes</h3>
        <span className="rounded-full bg-[#d9a441]/20 px-2.5 py-0.5 text-xs font-medium text-[#d9a441]">
          {diff.changedFieldCount} {diff.changedFieldCount === 1 ? "field" : "fields"} modified
        </span>
      </div>

      <ul className="divide-y divide-white/5 space-y-2">
        {diff.diffs.map((item) => (
          <li key={item.field} className="pt-2 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-white/90">{item.label}</span>
              <span className="text-xs text-white/50">{item.kind}</span>
            </div>

            {item.addedItems || item.removedItems ? (
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {item.addedItems?.map((added) => (
                  <span
                    key={added}
                    className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300"
                  >
                    <span>+</span> {added}
                  </span>
                ))}
                {item.removedItems?.map((removed) => (
                  <span
                    key={removed}
                    className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-rose-300 line-through"
                  >
                    <span>-</span> {removed}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="rounded bg-white/5 px-2 py-0.5 text-white/50">
                  {String(item.previousValue ?? "(none)")}
                </span>
                <span className="text-white/40">&rarr;</span>
                <span className="rounded bg-[#d9a441]/20 px-2 py-0.5 font-medium text-[#d9a441]">
                  {String(item.currentValue ?? "(none)")}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
