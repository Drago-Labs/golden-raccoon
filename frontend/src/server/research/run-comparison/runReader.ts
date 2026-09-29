/**
 * Normalizing a stored run into the shape the comparison needs.
 *
 * Stored records are an input, not a contract this feature controls, so every
 * field is read defensively. A record missing a field yields `null` rather
 * than a default that would later read as a real value.
 */
import type { AgentResult, AgentRunRecord } from "@/server/types";
import { RunComparisonError, type RunHeader } from "./schema";

export type NormalizedRun = {
  header: RunHeader;
  record: AgentRunRecord;
  results: AgentResult[];
  inputSnapshot: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The asset a run was about.
 *
 * Comparing two runs about different tokens is nearly always a mistake, so the
 * subject is extracted explicitly and the comparability check uses it.
 */
function subjectKeyOf(record: AgentRunRecord): string | null {
  const token = record.targetToken;

  if (!token) return null;

  const parts = [token.chain, token.tokenAddress ?? token.symbol ?? token.name].filter(Boolean);

  return parts.length > 0 ? parts.join(":").toLowerCase() : null;
}

function networkOf(record: AgentRunRecord): string | null {
  const fromToken = record.targetToken?.chain;

  if (typeof fromToken === "string" && fromToken.trim().length > 0) return fromToken;

  const fromSnapshot = asRecord(record.inputSnapshot)?.network;

  return typeof fromSnapshot === "string" && fromSnapshot.trim().length > 0 ? fromSnapshot : null;
}

export function normalizeRun(raw: unknown, runId: string): NormalizedRun {
  const record = asRecord(raw) as AgentRunRecord | null;

  if (!record || typeof record.id !== "string") {
    throw new RunComparisonError("unreadable_run", "The stored run could not be read.", 422, { runId });
  }

  const results = Array.isArray(record.results) ? (record.results.filter((entry) => asRecord(entry) !== null) as AgentResult[]) : [];

  return {
    record,
    results,
    inputSnapshot: asRecord(record.inputSnapshot) ?? {},
    header: {
      runId: record.id,
      walletAddress: record.walletAddress,
      network: networkOf(record),
      mode: typeof record.mode === "string" ? record.mode : null,
      status: String(record.status ?? "unknown"),
      recommendation: String(record.recommendation ?? "unknown"),
      decisionScore: Number.isFinite(record.decisionScore) ? Number(record.decisionScore) : 0,
      confidence: Number.isFinite(record.confidence) ? Number(record.confidence) : 0,
      createdAt: String(record.createdAt ?? ""),
      subjectKey: subjectKeyOf(record),
    },
  };
}
