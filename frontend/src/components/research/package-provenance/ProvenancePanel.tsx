"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ReleaseRecord } from "@/server/research/package-provenance/schema";

const VERDICT_TONES: Record<ReleaseRecord["provenance"]["verdict"], "success" | "warning" | "danger" | "neutral"> = {
  verified: "success",
  unverified: "neutral",
  unavailable: "warning",
};

const TAG_TONES: Record<ReleaseRecord["tagMatch"]["state"], "success" | "warning" | "neutral"> = {
  matched: "success",
  no_matching_tag: "warning",
  unknown: "neutral",
};

export function ProvenancePanel({ releases }: { releases: ReleaseRecord[] }) {
  if (releases.length === 0) {
    return <p className="text-sm text-muted">No releases were available to inspect.</p>;
  }

  return (
    <section data-testid="provenance-panel" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Release provenance</h2>
      <ul className="flex flex-col gap-3">
        {releases.map((release) => (
          <li key={release.version} className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-none last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{release.version}</span>
              <StatusBadge tone={VERDICT_TONES[release.provenance.verdict]}>{release.provenance.verdict}</StatusBadge>
              <StatusBadge tone={TAG_TONES[release.tagMatch.state]}>tag: {release.tagMatch.state}</StatusBadge>
            </div>
            {release.provenance.sourceRepository ? (
              <p className="text-xs text-subtle">
                Source: {release.provenance.sourceRepository}
                {release.provenance.commit ? ` @ ${release.provenance.commit.slice(0, 12)}` : ""}
                {release.provenance.workflowPath ? ` (${release.provenance.workflowPath})` : ""}
              </p>
            ) : null}
            <p className="text-xs text-subtle">{release.provenance.notes.join(" ")}</p>
            <p className="text-xs text-subtle">{release.tagMatch.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
