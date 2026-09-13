/**
 * Public entry point for network fee attribution and efficiency analytics.
 *
 * `analyseFees` takes the records and the reader as data. It returns a report
 * and touches nothing: no lifecycle record is written, no finality state is
 * recomputed, and no fee policy for any future transaction is affected. The
 * `FeeReader` port has two read methods and nothing that could submit.
 */
import { buildTimeline, totalsByCategory, totalsByNetwork } from "./aggregation";
import { buildCoverage, fiatUnavailableReason } from "./coverage";
import { attributeCharge } from "./payerAttribution";
import { adaptRecords } from "./transactionAdapter";
import type { TransactionRecord } from "@/server/types";
import {
  FEE_LIMITS,
  FEE_SCHEMA_VERSION,
  FeeAnalysisError,
  feeAnalysisRequestSchema,
  type FeeAnalysisReport,
  type FeeCharge,
  type FeeReader,
} from "./schema";

const DAY_MS = 86_400_000;

/**
 * Wraps the reader in one shared budget.
 *
 * Past the budget every read rejects, and a rejected read becomes an
 * `unknown` charge rather than an exception — so a wallet with thousands of
 * transactions degrades the report to partial instead of failing it.
 */
function budgeted(reader: FeeReader, budget: number): { reader: FeeReader; used: () => number } {
  let used = 0;

  async function spend<T>(run: () => Promise<T>): Promise<T> {
    if (used >= budget) {
      throw new Error(`The analysis reached its published ceiling of ${budget} reads.`);
    }

    used += 1;

    return run();
  }

  return {
    reader: {
      readEvmReceipt: (input) => spend(() => reader.readEvmReceipt(input)),
      readStellarMeta: (input) => spend(() => reader.readStellarMeta(input)),
    },
    used: () => used,
  };
}

export async function analyseFees(
  input: unknown,
  records: TransactionRecord[],
  reader: FeeReader,
): Promise<FeeAnalysisReport> {
  const parsed = feeAnalysisRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new FeeAnalysisError("invalid_request", "The fee analysis request could not be read.", parsed.error.flatten());
  }

  const fromMs = Date.parse(parsed.data.from);
  const toMs = Date.parse(parsed.data.to);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new FeeAnalysisError("invalid_window", "The analysis window could not be read.");
  }

  if (toMs < fromMs) {
    throw new FeeAnalysisError("invalid_window", "The window ends before it begins.");
  }

  if (toMs - fromMs > FEE_LIMITS.maxWindowDays * DAY_MS) {
    throw new FeeAnalysisError("window_too_large", `The window is longer than the published limit of ${FEE_LIMITS.maxWindowDays} days.`);
  }

  if (records.length > FEE_LIMITS.maxRecords) {
    throw new FeeAnalysisError("too_many_records", `More than ${FEE_LIMITS.maxRecords} records were supplied for one analysis.`);
  }

  const { candidates, excluded } = adaptRecords(records, {
    walletAddress: parsed.data.walletAddress,
    stellarAccount: parsed.data.stellarAccount,
    network: parsed.data.network,
    fromMs,
    toMs,
  });

  const budget = budgeted(reader, FEE_LIMITS.maxReads);
  const charges: FeeCharge[] = [];

  for (const candidate of candidates) {
    charges.push(await attributeCharge(candidate, budget.reader));
  }

  const byNetwork = totalsByNetwork(charges, parsed.data.conversions);

  return {
    schemaVersion: FEE_SCHEMA_VERSION,
    walletAddress: parsed.data.walletAddress,
    window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), bucket: parsed.data.bucket },
    charges,
    excluded,
    byNetwork,
    byCategory: totalsByCategory(charges, parsed.data.conversions),
    timeline: buildTimeline(charges, parsed.data.conversions, parsed.data.bucket),
    coverage: buildCoverage({
      recordCount: records.length,
      charges,
      excluded,
      readsUsed: budget.used(),
      readBudget: FEE_LIMITS.maxReads,
      byNetwork,
    }),
    fiatUnavailableReason: fiatUnavailableReason(byNetwork),
    readOnly: true,
    feePolicyUnchanged: true,
  };
}

export { FeeAnalysisError } from "./schema";
export type { FeeAnalysisReport, FeeReader } from "./schema";
