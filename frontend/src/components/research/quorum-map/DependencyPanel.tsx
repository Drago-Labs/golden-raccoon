import type { OrganizationDependency, SourceRecord, TomlDisagreement } from "@/server/research/quorum-map/schema";

export function DependencyPanel({ organization, disagreements, sources }: { organization: OrganizationDependency | null; disagreements: TomlDisagreement[]; sources: SourceRecord[] }) {
  return (
    <section data-testid="dependency-panel" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Dependency</h2>
      {organization ? (
        <p>
          {organization.organization} is named in {organization.topLevelCount} top-level quorum sets. Removing it breaks {organization.removalBreaks} of those thresholds.
        </p>
      ) : <p>Select an organization.</p>}
      {disagreements.length > 0 ? (
        <ul data-testid="toml-disagreements" className="mt-3 flex flex-col gap-1">
          {disagreements.map((row) => (
            <li key={`${row.publicKey}-${row.field}`}>{row.field}: node {row.nodeValue ?? "absent"}, toml {row.tomlValue ?? "absent"}</li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-3 flex flex-col gap-1">
        {sources.map((source) => (
          <li key={source.name}>
            {source.name}: {source.unavailable ? "unavailable" : source.stale ? `stale, ${source.ageSeconds} seconds old` : `${source.ageSeconds} seconds old`}
          </li>
        ))}
      </ul>
    </section>
  );
}
