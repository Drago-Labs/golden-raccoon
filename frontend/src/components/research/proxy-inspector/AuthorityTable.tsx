import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { AuthorityEvidence } from "@/server/research/proxy-inspector/schema";

const KIND_LABELS: Record<AuthorityEvidence["kind"], string> = {
  observed_admin_slot: "Admin slot",
  observed_beacon_owner: "Beacon owner",
  not_observed: "Not observed",
};

/**
 * Observed authority, with its limitation attached to every row.
 *
 * The limitation is not a footnote here. It sits in the same row as the
 * observation because the two are only honest together: an address in the
 * admin slot means very little without the sentence saying what it does not
 * prove.
 */
export function AuthorityTable({ authority }: { authority: AuthorityEvidence[] }) {
  return (
    <div data-testid="authority-table" className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">Observed upgrade authority and what each observation does not establish</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Source
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Holder
            </th>
            <th scope="col" className="py-2 font-medium">
              What this does not establish
            </th>
          </tr>
        </thead>
        <tbody>
          {authority.map((entry, index) => (
            <tr key={`${entry.kind}-${index}`} className="border-t border-white/8 align-top">
              <td className="py-3 pr-4">
                <StatusBadge tone={entry.kind === "not_observed" ? "neutral" : "warning"}>{KIND_LABELS[entry.kind]}</StatusBadge>
                <p className="mt-2 text-xs leading-5 text-white/42">{entry.evidence}</p>
              </td>
              <td className="py-3 pr-4 font-mono text-xs break-all text-white/78">
                {entry.holder ? (
                  <>
                    {entry.holder.address}
                    <span className="mt-1 block font-sans text-white/42">
                      {entry.holder.network}
                      {entry.holder.chainId === null ? "" : ` · chain ${entry.holder.chainId}`}
                      {entry.holderHasCode === null ? "" : entry.holderHasCode ? " · contract" : " · externally owned account"}
                    </span>
                  </>
                ) : (
                  <span className="font-sans text-white/42">—</span>
                )}
              </td>
              <td className="py-3 text-xs leading-5 text-white/54">{entry.limitation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
