import { QuorumMapError } from "./errors";
import { QUORUM_LIMITS } from "./limits";
import type { QuorumSetNode } from "./schema";

export type ParsedQuorum = { set: QuorumSetNode; truncated: boolean };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Parse a nested quorum set. Keys that are not known organizations are kept as validator strings. */
export function parseQuorumSet(value: unknown, depth = 0): ParsedQuorum {
  const record = asRecord(value);
  const threshold = Number(record?.threshold);
  if (!record || !Number.isInteger(threshold) || threshold < 1) {
    throw new QuorumMapError("invalid_quorum", "A quorum set is missing an integer threshold.");
  }
  const validators = Array.isArray(record.validators) ? record.validators.map((entry) => String(entry)) : [];
  const rawInner = record.innerSets ?? record.innerQuorumSets;
  if (depth >= QUORUM_LIMITS.maxDepth) {
    return { set: { threshold, validators, innerSets: [] }, truncated: true };
  }
  let truncated = false;
  const innerSets: QuorumSetNode[] = [];
  for (const inner of Array.isArray(rawInner) ? rawInner : []) {
    const parsed = parseQuorumSet(inner, depth + 1);
    innerSets.push(parsed.set);
    truncated = truncated || parsed.truncated;
  }
  return { set: { threshold, validators, innerSets }, truncated };
}
