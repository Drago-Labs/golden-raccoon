"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ExplanationNode } from "@/server/research/risk-explanations/schema";

type FlatNode = {
  node: ExplanationNode;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
};

const severityMark: Record<string, string> = {
  critical: "!!",
  high: "!",
  medium: "~",
  low: "·",
};

function flatten(
  node: ExplanationNode,
  expanded: Set<string>,
  depth = 0,
  parentId: string | null = null,
  out: FlatNode[] = [],
): FlatNode[] {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && expanded.has(node.id);
  out.push({ node, depth, parentId, hasChildren, expanded: isExpanded });

  if (isExpanded) {
    for (const child of node.children) {
      flatten(child, expanded, depth + 1, node.id, out);
    }
  }

  return out;
}

/**
 * Drill-down tree over the explanation.
 *
 * Implements the WAI-ARIA tree pattern with a roving tabindex: one tab stop for
 * the whole tree, arrow keys to move and expand, Home/End to jump. Severity is
 * carried by a text mark as well as the label, never by color alone.
 */
export function ExplanationTree({
  root,
  onSelectContribution,
  selectedKey,
}: {
  root: ExplanationNode;
  onSelectContribution?: (contributionKey: string) => void;
  selectedKey?: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id, "blockers"]));
  const [activeId, setActiveId] = useState<string>(root.id);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const rows = useMemo(() => flatten(root, expanded), [root, expanded]);

  const focusRow = useCallback((id: string) => {
    setActiveId(id);
    itemRefs.current.get(id)?.focus();
  }, []);

  const toggle = useCallback((id: string, next?: boolean) => {
    setExpanded((current) => {
      const updated = new Set(current);
      const shouldExpand = next ?? !updated.has(id);
      if (shouldExpand) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const currentIndex = rows.findIndex((row) => row.node.id === activeId);
    if (currentIndex < 0) return;
    const current = rows[currentIndex];

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = rows[Math.min(currentIndex + 1, rows.length - 1)];
        focusRow(next.node.id);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = rows[Math.max(currentIndex - 1, 0)];
        focusRow(previous.node.id);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (current.hasChildren && !current.expanded) {
          toggle(current.node.id, true);
        } else if (current.hasChildren) {
          focusRow(current.node.children[0].id);
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (current.hasChildren && current.expanded) {
          toggle(current.node.id, false);
        } else if (current.parentId) {
          focusRow(current.parentId);
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        focusRow(rows[0].node.id);
        break;
      }
      case "End": {
        event.preventDefault();
        focusRow(rows[rows.length - 1].node.id);
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (current.hasChildren) toggle(current.node.id);
        if (current.node.contributionKey) onSelectContribution?.(current.node.contributionKey);
        break;
      }
      default:
        break;
    }
  }

  return (
    <ul
      role="tree"
      aria-label="Risk explanation drill-down"
      className="space-y-1 text-sm"
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => {
        const isActive = row.node.id === activeId;
        const isSelected = Boolean(row.node.contributionKey && row.node.contributionKey === selectedKey);

        return (
          <li
            key={row.node.id}
            ref={(element) => {
              if (element) itemRefs.current.set(row.node.id, element);
              else itemRefs.current.delete(row.node.id);
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-selected={isSelected}
            tabIndex={isActive ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              focusRow(row.node.id);
              if (row.hasChildren) toggle(row.node.id);
              if (row.node.contributionKey) onSelectContribution?.(row.node.contributionKey);
            }}
            onFocus={() => setActiveId(row.node.id)}
            className={`cursor-pointer rounded-lg border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${
              isSelected ? "border-[var(--color-brand)]" : "border-white/10"
            }`}
            style={{ marginInlineStart: `${row.depth * 14}px` }}
          >
            <span className="flex items-center gap-2">
              {row.hasChildren ? (
                <span aria-hidden="true" className="text-xs text-subtle">
                  {row.expanded ? "▾" : "▸"}
                </span>
              ) : (
                <span aria-hidden="true" className="text-xs text-subtle">
                  •
                </span>
              )}
              {row.node.severity ? (
                <span className="font-mono text-xs text-subtle">
                  <span aria-hidden="true">{severityMark[row.node.severity] ?? "·"}</span>
                  <span className="sr-only">{`severity ${row.node.severity}`}</span>
                </span>
              ) : null}
              <span className="font-medium">{row.node.label}</span>
            </span>
            <span className="mt-0.5 block text-xs text-subtle">{row.node.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
