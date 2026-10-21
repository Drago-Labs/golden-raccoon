"use client";

import type { FigureChange } from "@/server/research/policy-changes/schema";

export function ChangedFigures({ figureChanges }: { figureChanges: FigureChange[] }) {
  if (figureChanges.length === 0) {
    return (
      <section aria-labelledby="changed-figures-heading" data-testid="changed-figures">
        <h2 id="changed-figures-heading" className="text-lg font-semibold">
          Changed figures
        </h2>
        <p className="mt-2 text-sm text-muted">No numbers or percentages changed in the latest comparison.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="changed-figures-heading" className="flex flex-col gap-3" data-testid="changed-figures">
      <h2 id="changed-figures-heading" className="text-lg font-semibold">
        Changed figures
      </h2>
      <ul className="flex flex-col gap-2">
        {figureChanges.map((change, index) => (
          <li key={index} className="rounded-xl border border-[#d9a441]/30 bg-[#d9a441]/5 px-3 py-2 text-sm">
            <p className="text-xs text-subtle">{change.context}</p>
            <p className="mt-1">
              <span className="text-red-200">{change.previousValue ?? "—"}</span>
              {" → "}
              <span className="text-emerald-200">{change.currentValue ?? "—"}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
