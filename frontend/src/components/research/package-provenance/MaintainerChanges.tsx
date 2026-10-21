"use client";

import type { InstallScriptChange, MaintainerChange } from "@/server/research/package-provenance/schema";

export function MaintainerChanges({ maintainerChanges, installScriptChanges }: { maintainerChanges: MaintainerChange[]; installScriptChanges: InstallScriptChange[] }) {
  if (maintainerChanges.length === 0 && installScriptChanges.length === 0) {
    return (
      <section data-testid="maintainer-changes" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted sm:p-5">
        No maintainer or lifecycle-script changes were observed across the inspected releases.
      </section>
    );
  }

  return (
    <section data-testid="maintainer-changes" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      {maintainerChanges.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Maintainer changes</h2>
          <ul className="flex flex-col gap-1 text-xs text-subtle">
            {maintainerChanges.map((change) => (
              <li key={`${change.fromVersion}-${change.toVersion}`}>
                <span className="font-mono">
                  {change.fromVersion} → {change.toVersion}
                </span>
                {change.added.length > 0 ? ` — added: ${change.added.join(", ")}` : ""}
                {change.removed.length > 0 ? ` — removed: ${change.removed.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {installScriptChanges.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">New install-lifecycle scripts</h2>
          <ul className="flex flex-col gap-1 text-xs text-subtle">
            {installScriptChanges.map((change) => (
              <li key={change.version}>
                <span className="font-mono">{change.version}</span> — added: {change.newScripts.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
