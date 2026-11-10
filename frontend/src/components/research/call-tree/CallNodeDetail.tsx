import type { CallTreeNode, FailureLocation } from "@/server/research/call-tree";

export function CallNodeDetail(props: {
  node: CallTreeNode | null;
  failure: FailureLocation | null;
}) {
  const { node, failure } = props;
  return (
    <div data-testid="call-node-detail" className="space-y-3 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Call node detail</h3>
      {failure && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-red-200">
          Inner call failed at <span className="font-mono">{failure.functionName}</span> (depth{" "}
          {failure.depth}): {failure.errorMessage}
        </div>
      )}
      {!node ? (
        <p className="text-white/60">Select a call node to inspect decoded arguments and return values.</p>
      ) : (
        <div className="space-y-2">
          <div>
            <span className="text-white/50">Contract: </span>
            <span className="font-mono text-white">{node.contractId}</span>
          </div>
          <div>
            <span className="text-white/50">Function: </span>
            <span className="font-mono font-semibold text-white">{node.functionName}</span>
          </div>
          <div>
            <span className="text-white/50">Arguments:</span>
            {node.args.length === 0 ? (
              <p className="text-white/60">None</p>
            ) : (
              <ul className="mt-1 space-y-1 font-mono">
                {node.args.map((arg) => (
                  <li key={arg.name}>
                    {arg.name} ({arg.type}): {arg.displayValue}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <span className="text-white/50">Outcome: </span>
            {node.status === "failed" ? (
              <span className="text-red-300">Error — {node.errorMessage}</span>
            ) : (
              <span className="font-mono text-white">
                {node.returnValue ? `${node.returnValue.displayValue} (${node.returnValue.type})` : "void"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
