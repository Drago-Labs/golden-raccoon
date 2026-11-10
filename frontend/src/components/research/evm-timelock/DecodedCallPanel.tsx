import type { TimelockOperation } from "@/server/research/evm-timelock";

export function DecodedCallPanel(props: { operations: TimelockOperation[] }) {
  const calls = props.operations.flatMap((op) =>
    op.calls.map((c) => ({ operationId: op.operationId, ...c })),
  );
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Decoded call payloads</h3>
      {calls.length === 0 ? (
        <p className="text-white/60">No call payloads to display.</p>
      ) : (
        <ul className="space-y-2">
          {calls.map((call) => (
            <li key={`${call.operationId}-${call.index}`} className="rounded border border-white/10 p-2">
              <div className="font-mono text-white">
                #{call.index} → {call.target}
              </div>
              <div>
                {call.decoded && call.functionName
                  ? `${call.functionName}(${(call.args ?? []).join(", ")})`
                  : `Raw calldata: ${call.rawData}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
