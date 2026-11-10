import type { NetTransferEntry } from "@/server/research/call-tree";

export function TransferSummary(props: { netMovements: NetTransferEntry[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Net token movements</h3>
      {props.netMovements.length === 0 ? (
        <p className="text-white/60">No token transfers emitted during this invocation.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-white/60">
              <th className="py-1">Address</th>
              <th className="py-1">Token</th>
              <th className="py-1">Net delta (raw units)</th>
            </tr>
          </thead>
          <tbody>
            {props.netMovements.map((m) => (
              <tr key={`${m.address}-${m.tokenContractId}`} className="border-b border-white/5">
                <td className="py-1 font-mono">{m.address}</td>
                <td className="py-1 font-medium text-white">{m.symbol}</td>
                <td className="py-1 font-mono">{m.netDeltaRaw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
