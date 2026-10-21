"use client";

import type { PackageProvenanceReport } from "@/server/research/package-provenance/schema";

export function ReleaseTimeline({ report }: { report: PackageProvenanceReport }) {
  return (
    <section data-testid="release-timeline" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Releases</h2>
      <p className="text-xs text-subtle">
        Inspected {report.releasesInspected} of {report.releasesAvailable} published release{report.releasesAvailable === 1 ? "" : "s"} for{" "}
        <span className="font-mono">{report.packageName}</span> ({report.registry}).
        {report.declaredRepository ? ` Declared repository: ${report.declaredRepository}.` : " No repository was declared."}
      </p>
      <ol className="flex flex-col gap-1 text-xs text-subtle">
        {report.releases.map((release) => (
          <li key={release.version} className="font-mono">
            {release.version}
            {release.publishedAt ? ` — ${release.publishedAt}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
