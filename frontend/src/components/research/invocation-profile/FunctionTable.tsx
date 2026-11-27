import type { FunctionAggregate } from "@/server/research/invocation-profile/schema";

export function FunctionTable({ functions }: { functions: FunctionAggregate[] }) {
  if (functions.length === 0) {
    return <p className="text-sm text-muted">No function invocations in this window.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Function invocation counts</caption>
        <thead className="border-b border-white/10 bg-white/4 text-xs uppercase tracking-wide text-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Function
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Success
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Failure
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Unique callers
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Direct / via contract
            </th>
          </tr>
        </thead>
        <tbody>
          {functions.map((row) => (
            <tr key={row.functionName} className="border-b border-white/5">
              <td className="px-3 py-2 font-mono">{row.functionName}</td>
              <td className="px-3 py-2">{row.successCount}</td>
              <td className="px-3 py-2">{row.failureCount}</td>
              <td className="px-3 py-2">{row.uniqueCallers}</td>
              <td className="px-3 py-2">
                {row.directCallers} / {row.viaContractCallers}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
