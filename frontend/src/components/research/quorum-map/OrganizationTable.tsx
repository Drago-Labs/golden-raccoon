import type { OrganizationDependency } from "@/server/research/quorum-map/schema";

export function OrganizationTable({ organizations, selected, onSelect }: { organizations: OrganizationDependency[]; selected: string | null; onSelect: (organization: string) => void }) {
  return (
    <section data-testid="organization-table" className="overflow-x-auto rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Organizations</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-subtle">
            <th className="py-2 pr-3">Organization</th>
            <th className="py-2 pr-3">Top-level sets</th>
            <th className="py-2">Removal breaks</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((organization) => (
            <tr key={organization.organization} className={organization.organization === selected ? "bg-white/5" : undefined}>
              <td className="py-2 pr-3">
                <button type="button" className="underline underline-offset-2" onClick={() => onSelect(organization.organization)}>
                  {organization.organization}
                </button>
              </td>
              <td className="py-2 pr-3">{organization.topLevelCount}</td>
              <td className="py-2">{organization.removalBreaks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
