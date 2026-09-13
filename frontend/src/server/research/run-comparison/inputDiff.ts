/**
 * Differences in what the two runs were given.
 *
 * The snapshot is walked to a bounded depth and flattened to dotted paths, so
 * "the balance changed" reads as `portfolio.balances.USDC: 100 → 250` rather
 * than as two opaque JSON blobs. A value that is an object on one side and a
 * scalar on the other is reported as changed at that path rather than
 * descended into, because the shapes do not line up.
 */
import type { InputDifference } from "./schema";

const MAX_DEPTH = 6;
const MAX_PATHS = 500;

function flatten(value: unknown, prefix: string, depth: number, into: Map<string, string>): void {
  if (into.size >= MAX_PATHS) return;

  if (value === null || value === undefined) {
    into.set(prefix, "null");
    return;
  }

  if (typeof value !== "object") {
    into.set(prefix, String(value));
    return;
  }

  if (depth >= MAX_DEPTH) {
    into.set(prefix, JSON.stringify(value).slice(0, 200));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index}]`, depth + 1, into));
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    flatten(entry, prefix ? `${prefix}.${key}` : key, depth + 1, into);
  }
}

export function diffInputs(left: Record<string, unknown>, right: Record<string, unknown>): InputDifference[] {
  const leftPaths = new Map<string, string>();
  const rightPaths = new Map<string, string>();

  flatten(left, "", 0, leftPaths);
  flatten(right, "", 0, rightPaths);

  const paths = [...new Set([...leftPaths.keys(), ...rightPaths.keys()])].sort();
  const differences: InputDifference[] = [];

  for (const path of paths) {
    const before = leftPaths.get(path);
    const after = rightPaths.get(path);

    if (before === after) continue;

    differences.push({
      path,
      before: before ?? null,
      after: after ?? null,
      kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
    });
  }

  return differences;
}
