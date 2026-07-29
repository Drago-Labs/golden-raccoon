"use client";

import type { DecisionDetail as DecisionDetailType } from "@/server/types";

type DecisionDetailProps = {
  detail: DecisionDetailType | null;
  loading?: boolean;
  error?: string | null;
};

export function DecisionDetailPanel({ detail, loading, error }: DecisionDetailProps) {
  if (loading) {
    return (
      <div className="rounded-lg bg-white/5 p-4 text-sm text-white/42">
        Loading decision detail...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300/20 bg-red-500/5 p-4 text-sm text-red-200/70">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg bg-white/5 p-4 text-sm text-white/42">
        No decision detail available for this run.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white/50">Decision Summary</div>
          <p className="mt-1 text-sm text-white/70">{detail.summary}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-white/70">{detail.score}/100</div>
          <div className="text-xs text-white/42">{Math.round(detail.confidence * 100)}% confidence</div>
        </div>
      </div>

      {detail.reasons.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            Reasons ({detail.reasons.length})
          </div>
          <ul className="space-y-1">
            {detail.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400/60" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.blockers.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400/70">
            Blockers ({detail.blockers.length})
          </div>
          <ul className="space-y-1">
            {detail.blockers.map((blocker, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-300/60">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.ruleSnapshot && Object.keys(detail.ruleSnapshot).length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Rule Snapshot</div>
          <pre className="overflow-x-auto rounded bg-white/5 p-3 text-xs text-white/50">
            {JSON.stringify(detail.ruleSnapshot, null, 2)}
          </pre>
        </div>
      )}

      {detail.whatWouldChange && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-400/70">
            What Would Change
          </div>
          <p className="text-xs leading-5 text-white/60">{detail.whatWouldChange}</p>
        </div>
      )}
    </div>
  );
}
