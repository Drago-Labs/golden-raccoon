/**
 * Say what the comparison does and does not cover.
 *
 * One provider down is a single-source result. Both down is unavailable.
 * Horizon does not expose contract data entries; when the check still has RPC
 * entries, the notice says those rows are single-source.
 */
import type { CoverageNotice, FieldComparison, ProviderStatus } from "./schema";

export function buildCoverage(input: {
  fields: FieldComparison[];
  providers: ProviderStatus[];
  horizonContractDataExposed: boolean;
  omittedTrustlines: number;
  omittedLedgerKeys: number;
}): CoverageNotice {
  const matchedCount = input.fields.filter((field) => field.classification === "matched").length;
  const laggingCount = input.fields.filter((field) => field.classification === "lagging").length;
  const conflictingCount = input.fields.filter((field) => field.classification === "conflicting").length;
  const singleSourceCount = input.fields.filter((field) => field.classification === "single_source").length;
  const horizon = input.providers.find((provider) => provider.provider === "horizon");
  const rpc = input.providers.find((provider) => provider.provider === "rpc");
  const horizonUp = horizon?.availability === "available";
  const rpcUp = rpc?.availability === "available";

  const shared = {
    fieldCount: input.fields.length,
    matchedCount,
    laggingCount,
    conflictingCount,
    singleSourceCount,
    horizonContractDataExposed: input.horizonContractDataExposed,
    omittedTrustlines: input.omittedTrustlines,
    omittedLedgerKeys: input.omittedLedgerKeys,
  };

  const omission =
    input.omittedTrustlines > 0 || input.omittedLedgerKeys > 0
      ? ` ${input.omittedTrustlines} trustline(s) and ${input.omittedLedgerKeys} ledger key(s) were omitted by the size bounds.`
      : "";

  if (!horizonUp && !rpcUp) {
    return {
      ...shared,
      state: "unavailable",
      note: "Both Horizon and Stellar RPC were unavailable, so there is nothing to compare.",
    };
  }

  if (!horizonUp || !rpcUp) {
    const down = horizonUp ? "Stellar RPC" : "Horizon";
    const up = horizonUp ? "Horizon" : "Stellar RPC";

    return {
      ...shared,
      state: "single_source",
      note: `${down} is unavailable. Every value below is a single-source result from ${up}.${omission}`,
    };
  }

  if (!input.horizonContractDataExposed && input.fields.some((field) => field.kind === "contract_data")) {
    return {
      ...shared,
      state: "partial",
      note: `Horizon does not expose contract data entries. Those rows are Stellar RPC only. ${matchedCount} field(s) matched, ${laggingCount} lagged, ${conflictingCount} conflicted.${omission}`,
    };
  }

  if (input.fields.length === 0) {
    return {
      ...shared,
      state: "partial",
      note: `Both providers answered, but neither returned a comparable field for this target.${omission}`,
    };
  }

  if (laggingCount === 0 && conflictingCount === 0 && singleSourceCount === 0 && input.omittedTrustlines === 0 && input.omittedLedgerKeys === 0) {
    return {
      ...shared,
      state: "complete",
      note: `All ${matchedCount} compared field(s) matched at the same ledger.`,
    };
  }

  return {
    ...shared,
    state: "partial",
    note: `${matchedCount} matched, ${laggingCount} lagged, ${conflictingCount} conflicted, ${singleSourceCount} single-source.${omission}`,
  };
}
