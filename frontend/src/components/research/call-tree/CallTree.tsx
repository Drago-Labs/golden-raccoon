import { useState } from "react";
import type { CallTreeNode } from "@/server/research/call-tree";

function TreeNodeItem(props: {
  node: CallTreeNode;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { node, selectedNodeId, onSelect } = props;
  const hasChildren = node.children.length > 0;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} className="space-y-1">
      <div className="flex items-center gap-2">
        {hasChildren && (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.functionName}` : `Expand ${node.functionName}`}
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded border border-white/15 px-1.5 py-0.5 text-[10px]"
          >
            {expanded ? "−" : "+"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect(node.nodeId)}
          className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs ${
            selectedNodeId === node.nodeId ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/5"
          }`}
        >
          <span className="font-mono text-white/60">[{node.depth}]</span>
          <span className="font-semibold">{node.functionName}</span>
          <span className="font-mono text-white/50">{node.contractId.slice(0, 8)}…</span>
          {node.status === "failed" && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">
              FAILED
            </span>
          )}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul role="group" className="ml-5 space-y-1 border-l border-white/10 pl-3">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.nodeId}
              node={child}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CallTree(props: {
  roots: CallTreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Cross-contract call tree</h3>
      {props.roots.length === 0 ? (
        <p className="text-white/60">No contract calls recorded.</p>
      ) : (
        <ul role="tree" aria-label="Contract call hierarchy" className="space-y-2">
          {props.roots.map((root) => (
            <TreeNodeItem
              key={root.nodeId}
              node={root}
              selectedNodeId={props.selectedNodeId}
              onSelect={props.onSelectNode}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
