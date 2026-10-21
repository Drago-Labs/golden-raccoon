/**
 * Decide whether two ledgers are the same moment.
 *
 * A gap of one ledger is lag. Classification is not allowed to call that a
 * conflict, even when the values also differ. Missing ledgers are not treated
 * as equal.
 */
import type { FieldComparison, LagSummary, ProviderName, ProviderStatus } from "./schema";

export type LedgerAlignment = {
  relation: "same" | "lag" | "unknown";
  gap: number | null;
  behind: ProviderName | null;
};

export function alignLedgers(horizonLedger: number | null, rpcLedger: number | null): LedgerAlignment {
  if (horizonLedger == null || rpcLedger == null) {
    return { relation: "unknown", gap: null, behind: null };
  }

  if (!Number.isInteger(horizonLedger) || !Number.isInteger(rpcLedger) || horizonLedger < 0 || rpcLedger < 0) {
    return { relation: "unknown", gap: null, behind: null };
  }

  if (horizonLedger === rpcLedger) {
    return { relation: "same", gap: 0, behind: null };
  }

  return {
    relation: "lag",
    gap: Math.abs(horizonLedger - rpcLedger),
    behind: horizonLedger < rpcLedger ? "horizon" : "rpc",
  };
}

function providerGap(providers: ProviderStatus[]): { gap: number | null; behind: ProviderName | null } {
  const horizon = providers.find((provider) => provider.provider === "horizon");
  const rpc = providers.find((provider) => provider.provider === "rpc");
  const aligned = alignLedgers(horizon?.latestLedger ?? null, rpc?.latestLedger ?? null);

  if (aligned.relation !== "lag") {
    return { gap: aligned.relation === "same" ? 0 : null, behind: null };
  }

  return { gap: aligned.gap, behind: aligned.behind };
}

/**
 * Field lag is the classification result. Provider lag is the gap between the
 * two latest ledgers, which can exist even when every compared field was read
 * at the same older ledger.
 */
export function summarizeLag(fields: FieldComparison[], providers: ProviderStatus[]): LagSummary {
  const lagging = fields.filter((field) => field.classification === "lagging");
  let largestFieldGap: number | null = null;
  let trailingProvider: ProviderName | null = null;

  for (const field of lagging) {
    const aligned = alignLedgers(field.horizon?.ledger ?? null, field.rpc?.ledger ?? null);

    if (aligned.gap == null) continue;

    if (largestFieldGap == null || aligned.gap > largestFieldGap) {
      largestFieldGap = aligned.gap;
      trailingProvider = aligned.behind;
    }
  }

  const tips = providerGap(providers);
  const trailingName = trailingProvider === "horizon" ? "Horizon" : trailingProvider === "rpc" ? "Stellar RPC" : null;

  let note: string;

  if (lagging.length === 0 && (tips.gap == null || tips.gap === 0)) {
    note = "Compared fields were read at the same ledger, and the providers report the same latest ledger.";
  } else if (lagging.length === 0 && tips.gap != null && tips.gap > 0) {
    const behind = tips.behind === "horizon" ? "Horizon" : "Stellar RPC";
    note = `Compared fields share a ledger. The providers' latest ledgers still differ by ${tips.gap}; ${behind} is behind.`;
  } else if (largestFieldGap == null) {
    note = `${lagging.length} field(s) could not be placed on one ledger, so they are lag rather than a conflict.`;
  } else {
    note = `${lagging.length} field(s) were read at different ledgers. The largest gap is ${largestFieldGap} ledger(s)${trailingName ? `, with ${trailingName} behind` : ""}. Different ledgers are lag, not a conflict.`;
  }

  return {
    laggingFieldCount: lagging.length,
    largestFieldGap,
    trailingProvider,
    providerLedgerGap: tips.gap,
    note,
  };
}
