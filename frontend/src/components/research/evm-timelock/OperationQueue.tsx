import type { TimelockOperation } from "@/server/research/evm-timelock";

export function OperationQueue(props: { operations: TimelockOperation[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Scheduled operations</h3>
      {props.operations.length === 0 ? (
        <p className="text-white/60">No operations recorded in the inspected block range.</p>
      ) : (
        <ul className="space-y-2">
          {props.operations.map((op) => (
            <li key={op.operationId} className="rounded border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-white">{op.operationId}</span>
                <span className="uppercase text-white/80">{op.status}</span>
              </div>
              <div className="text-white/60">
                Delay: {op.delaySeconds}s · Ready at: {op.readyAtTimestamp} · Calls: {op.calls.length}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
