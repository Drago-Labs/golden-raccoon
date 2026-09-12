"use client";

import { useEffect, useRef } from "react";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ExplanationContribution, EvidenceSourceSummary } from "@/server/research/risk-explanations/schema";

const statusTone = { connected: "success", mock: "warning", unavailable: "danger" } as const;

/**
 * Side panel showing the source behind one selected contribution.
 *
 * The drawer is a non-modal complementary region: it takes focus when opened so
 * a keyboard user lands on the detail they asked for, and Escape returns them
 * to the table.
 */
export function EvidenceDrawer({
  contribution,
  source,
  onClose,
}: {
  contribution: ExplanationContribution | null;
  source: EvidenceSourceSummary | null;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (contribution) headingRef.current?.focus();
  }, [contribution]);

  if (!contribution) {
    return (
      <aside aria-label="Evidence detail" className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-subtle">
        Select a factor to inspect the source it named.
      </aside>
    );
  }

  return (
    <aside
      aria-label="Evidence detail"
      className="rounded-xl border border-white/10 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
          {contribution.label}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-2 py-1 text-xs text-subtle hover:text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
        >
          Close
        </button>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-subtle">Reported by</dt>
          <dd>
            {contribution.agentDisplayName} <span className="font-mono text-[11px] text-subtle">({contribution.agent})</span>
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Contribution key</dt>
          <dd className="break-all font-mono text-[11px]">{contribution.key}</dd>
        </div>
        <div>
          <dt className="text-subtle">Recorded impact</dt>
          <dd>
            {contribution.impact === null
              ? "Not recorded. This factor is descriptive."
              : `${contribution.impact} (${contribution.direction.replace(/_/g, " ")})`}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Detail</dt>
          <dd>{contribution.detail}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-white/10 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Source</h4>
        {contribution.evidence.state === "unlinked" ? (
          <p className="mt-2 text-xs text-subtle">{contribution.evidence.note}</p>
        ) : null}
        {contribution.evidence.state === "label_only" ? (
          <p className="mt-2 text-xs text-subtle">
            <span className="font-medium">{contribution.evidence.claimedLabel}</span> — {contribution.evidence.note}
          </p>
        ) : null}
        {source ? (
          <dl className="mt-2 space-y-2 text-xs">
            <div>
              <dt className="text-subtle">Label</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {source.label}
                <StatusBadge tone={statusTone[source.status]}>{source.status}</StatusBadge>
              </dd>
            </div>
            {source.provider ? (
              <div>
                <dt className="text-subtle">Provider</dt>
                <dd>{source.provider}</dd>
              </div>
            ) : null}
            {source.checkedAt ? (
              <div>
                <dt className="text-subtle">Checked at</dt>
                <dd>{source.checkedAt}</dd>
              </div>
            ) : null}
            {source.detail ? (
              <div>
                <dt className="text-subtle">Detail</dt>
                <dd>{source.detail}</dd>
              </div>
            ) : null}
            {source.url ? (
              <div>
                <dt className="text-subtle">Reference</dt>
                <dd className="break-all font-mono text-[11px]">{source.url}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-subtle">Also cited by</dt>
              <dd>
                {source.contributionKeys.length === 0
                  ? "No factor cited this source."
                  : `${source.contributionKeys.length} factor${source.contributionKeys.length === 1 ? "" : "s"}`}
              </dd>
            </div>
          </dl>
        ) : null}
        {contribution.evidence.state === "ambiguous" ? (
          <p className="mt-2 text-xs text-[#f2c86d]">{contribution.evidence.note}</p>
        ) : null}
      </div>
    </aside>
  );
}
