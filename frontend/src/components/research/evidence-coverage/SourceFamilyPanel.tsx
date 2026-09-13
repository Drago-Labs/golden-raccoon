"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { SourceFamily, SourceObservation } from "@/server/research/evidence-coverage/schema";

/**
 * Provenance groups.
 *
 * Declared families are listed with the rationale that justifies grouping them,
 * because the grouping is what decides whether several observations count once
 * or several times. Sources nobody declared are shown as standing alone.
 */
export function SourceFamilyPanel({
  families,
  observations,
}: {
  families: SourceFamily[];
  observations: SourceObservation[];
}) {
  const ungrouped = [
    ...new Map(
      observations
        .filter((observation) => observation.familyId.startsWith("ungrouped:"))
        .map((observation) => [observation.familyId, observation]),
    ).values(),
  ];

  return (
    <section aria-labelledby="evidence-families-heading" className="space-y-4">
      <h3 id="evidence-families-heading" className="text-sm font-semibold">
        Source families
      </h3>
      <p className="text-xs text-subtle">
        Families are declared, never guessed from a name. Observations inside one family count once, however many there
        are.
      </p>

      {families.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-xs text-subtle">
          No source family was declared for this report. Every source is treated as standing alone, which neither borrows
          nor lends corroboration.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="declared-families">
          {families.map((family) => (
            <li key={family.familyId} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{family.label}</span>
                <span className="font-mono text-[11px] text-subtle">{family.familyId}</span>
                <StatusBadge tone="neutral">
                  {family.memberLabels.length} member{family.memberLabels.length === 1 ? "" : "s"}
                </StatusBadge>
              </span>
              <span className="mt-1 block text-subtle">{family.memberLabels.join(", ")}</span>
              <span className="mt-1 block text-subtle">{family.rationale}</span>
            </li>
          ))}
        </ul>
      )}

      {ungrouped.length > 0 ? (
        <div data-testid="ungrouped-sources">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Sources standing alone ({ungrouped.length})
          </h4>
          <ul className="mt-2 space-y-1 text-xs text-subtle">
            {ungrouped.map((observation) => (
              <li key={observation.familyId}>
                {observation.sourceLabel} — no family was declared for this source, so it is counted on its own.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
