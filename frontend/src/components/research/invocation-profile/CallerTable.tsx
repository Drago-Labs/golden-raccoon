import type { CallerAggregate } from "@/server/research/invocation-profile/schema";

export function CallerTable({ callers }: { callers: CallerAggregate[] }) {
  if (callers.length === 0) {
    return <p className="text-sm text-muted">No callers in this window.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Caller invocation counts</caption>
        <thead className="border-b border-white/10 bg-white/4 text-xs uppercase tracking-wide text-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Caller
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Success
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Failure
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Functions
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Direct / via contract
            </th>
          </tr>
        </thead>
        <tbody>
          {callers.map((row) => (
            <tr key={row.account} className="border-b border-white/5">
              <td className="px-3 py-2 font-mono text-xs">{row.account}</td>
              <td className="px-3 py-2">{row.successCount}</td>
              <td className="px-3 py-2">{row.failureCount}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.functionNames.join(", ")}</td>
              <td className="px-3 py-2">
                {row.directCount} / {row.viaContractCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
