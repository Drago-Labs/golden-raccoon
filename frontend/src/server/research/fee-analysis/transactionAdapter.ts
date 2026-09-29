/**
 * Turning lifecycle records into fee candidates.
 *
 * This is where double-counting is prevented, and it is the part of the
 * feature most worth reading carefully. A wallet's history contains the same
 * economic event more than once in two different ways:
 *
 * 1. **Replacement.** A transaction was sped up or cancelled, so an old hash
 *    and a new hash describe one intent. The chain charged for the one that
 *    landed. The superseded record is excluded and says what superseded it.
 * 2. **Duplicate observation.** The same hash appears twice in the records.
 *    One hash is one charge, regardless of how many times it was observed.
 *
 * Nothing here mutates a record. The lifecycle store is an input.
 */
import type { TransactionRecord } from "@/server/types";
import type { ExcludedRecord, OperationCategory } from "./schema";

export type FeeCandidate = {
  record: TransactionRecord;
  category: OperationCategory;
  outcome: "succeeded" | "failed" | "unknown";
  occurredAt: string | null;
};

const CATEGORY_BY_TYPE: Record<TransactionRecord["type"], OperationCategory> = {
  swap: "swap",
  approval: "approval",
  transfer: "transfer",
  trustline_create: "trustline",
  trustline_change: "trustline",
  agent_log: "agent_log",
};

/** Lifecycle states that mean the chain has finished with the transaction. */
const TERMINAL_STATES = new Set(["confirmed", "finalized", "failed", "reverted", "replaced", "dropped"]);

function outcomeOf(record: TransactionRecord): "succeeded" | "failed" | "unknown" {
  const status = String(record.lifecycleStatus ?? record.status ?? "");

  if (status === "confirmed" || status === "finalized") return "succeeded";
  if (status === "failed" || status === "reverted") return "failed";

  return "unknown";
}

function occurredAt(record: TransactionRecord): string | null {
  return record.terminalAt ?? record.submittedAt ?? record.createdAt ?? null;
}

export function adaptRecords(
  records: TransactionRecord[],
  filters: { walletAddress: string; stellarAccount?: string; network?: string; fromMs: number; toMs: number },
): { candidates: FeeCandidate[]; excluded: ExcludedRecord[] } {
  const excluded: ExcludedRecord[] = [];
  const seenHashes = new Map<string, TransactionRecord>();

  // The accounts the caller vouched for. A record whose owner is not one of
  // them is another wallet's, whichever chain family it came from.
  const ownedAccounts = new Set(
    [filters.walletAddress, filters.stellarAccount].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()),
  );

  // A hash named as someone's replacement is superseded, wherever it appears
  // in the list — so the set is built before any record is accepted.
  const supersededBy = new Map<string, string>();

  for (const record of records) {
    if (record.replacementHash && record.replacementHash !== record.hash) {
      supersededBy.set(record.hash.toLowerCase(), record.replacementHash);
    }
  }

  const candidates: FeeCandidate[] = [];

  for (const record of records) {
    const hash = record.hash?.toLowerCase() ?? "";

    if (hash.length === 0) continue;

    const owner = (record.walletAddress ?? record.sourceAccount ?? "").toLowerCase();

    if (owner.length > 0 && !ownedAccounts.has(owner)) {
      excluded.push({
        hash: record.hash,
        reason: "other_wallet",
        detail: "The record belongs to an account the request did not name.",
        supersededBy: null,
      });
      continue;
    }

    if (filters.network && record.network !== filters.network) {
      excluded.push({
        hash: record.hash,
        reason: "other_network",
        detail: `The record is on ${record.network}, and the analysis was narrowed to ${filters.network}.`,
        supersededBy: null,
      });
      continue;
    }

    if (seenHashes.has(hash)) {
      excluded.push({
        hash: record.hash,
        reason: "duplicate_observation",
        detail: "This hash already appears in the records. One hash carries one charge.",
        supersededBy: null,
      });
      continue;
    }

    const replacement = supersededBy.get(hash);

    if (replacement) {
      excluded.push({
        hash: record.hash,
        reason: "superseded_by_replacement",
        detail: "This transaction was replaced. The charge is attributed to its replacement so one intent is not counted twice.",
        supersededBy: replacement,
      });
      seenHashes.set(hash, record);
      continue;
    }

    const status = String(record.lifecycleStatus ?? record.status ?? "");

    if (!TERMINAL_STATES.has(status)) {
      excluded.push({
        hash: record.hash,
        reason: "not_terminal",
        detail: `The transaction is still ${status || "in an unknown state"}, so no final charge exists yet.`,
        supersededBy: null,
      });
      seenHashes.set(hash, record);
      continue;
    }

    const at = occurredAt(record);
    const atMs = at ? Date.parse(at) : Number.NaN;

    if (Number.isFinite(atMs) && (atMs < filters.fromMs || atMs > filters.toMs)) {
      excluded.push({
        hash: record.hash,
        reason: "out_of_window",
        detail: "The transaction is outside the requested window.",
        supersededBy: null,
      });
      seenHashes.set(hash, record);
      continue;
    }

    seenHashes.set(hash, record);
    candidates.push({
      record,
      category: CATEGORY_BY_TYPE[record.type] ?? "other",
      outcome: outcomeOf(record),
      occurredAt: at,
    });
  }

  return { candidates, excluded };
}
