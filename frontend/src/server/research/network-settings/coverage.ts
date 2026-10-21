/**
 * Says what a read actually covered. Missing ids are not treated as zero.
 */

import type { SettingsReadState } from "./errors";
import type { CoverageReport } from "./schema";

export function buildCoverage(input: {
  requested: number;
  returned: number;
  unknown: number;
  historyKept: number;
  historyTruncated: boolean;
  providerFailed: boolean;
}): CoverageReport {
  if (input.providerFailed) {
    return {
      state: "unavailable",
      requested: input.requested,
      returned: 0,
      unknown: 0,
      historyKept: input.historyKept,
      historyTruncated: input.historyTruncated,
      message: "The RPC provider did not return config settings. Nothing here is inferred.",
    };
  }

  const missing = Math.max(0, input.requested - input.returned);
  const state: SettingsReadState =
    missing > 0 || input.unknown > 0 || input.historyTruncated ? "partial" : "complete";
  const parts = [
    missing > 0
      ? `${missing} requested setting ${missing === 1 ? "id was" : "ids were"} not in the response.`
      : "Every requested setting id was returned.",
    input.unknown > 0
      ? `${input.unknown} unknown setting ${input.unknown === 1 ? "id is" : "ids are"} shown raw.`
      : null,
    input.historyTruncated ? "Older upgrades were dropped to keep the history bounded." : null,
  ].filter((part): part is string => Boolean(part));

  return {
    state,
    requested: input.requested,
    returned: input.returned,
    unknown: input.unknown,
    historyKept: input.historyKept,
    historyTruncated: input.historyTruncated,
    message: parts.join(" "),
  };
}
