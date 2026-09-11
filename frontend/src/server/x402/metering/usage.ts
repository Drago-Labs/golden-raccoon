import type { X402ChainFamily } from "@/server/types";
import type { SettlementRecord } from "@/server/x402/settlement/types";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { StoredUsage, X402Store } from "@/server/x402/store/store";
import type { SettlementLedger } from "@/server/x402/settlement/ledger";

export type PayerUsageSummary = StoredUsage;

export type UsageReconciliationSummary = {
  payer: string;
  chainFamily: X402ChainFamily;
  meteredRequests: number;
  settledRequests: number;
  meteredSpend: Record<string, string>;
  settledSpend: Record<string, string>;
  meteredSuccess: number;
  settledSuccess: number;
  meteredFailed: number;
  settledFailed: number;
  isReconciled: boolean;
};

export type UsageReconciliationResult = {
  matches: boolean;
  discrepancies: string[];
  summaries: UsageReconciliationSummary[];
};

export type SinglePayerReconciliation = {
  discrepancy: boolean;
  meteredCount: number;
  ledgerCount: number;
  meteredTotal: number;
  ledgerTotal: number;
  details?: string;
};

/**
 * Tracks and reconciles per-payer usage across EVM and Stellar settlement schemes.
 */
export class UsageTracker {
  constructor(
    private readonly store: X402Store = memoryX402Store,
    private readonly ledger?: SettlementLedger,
  ) {}

  /**
   * Records a settled usage event for a payer.
   */
  async recordSettlementUsage(
    payer: string,
    chainFamily: X402ChainFamily,
    settlement: { amount: string; canonicalAsset: string; success: boolean },
  ): Promise<StoredUsage> {
    return this.store.recordUsage(payer, chainFamily, settlement);
  }

  /**
   * Retrieves usage summary for a single payer.
   */
  async getPayerUsage(payer: string): Promise<StoredUsage | null> {
    return this.store.getUsage(payer);
  }

  /**
   * Lists all recorded payer usage summaries.
   */
  async listAllUsage(): Promise<StoredUsage[]> {
    return this.store.listUsage();
  }

  /**
   * Reconciles recorded payer metering aggregates against physical settlement records in the ledger.
   */
  async reconcileAgainstSettlements(settlements: SettlementRecord[]): Promise<UsageReconciliationResult> {
    const meteredList = await this.store.listUsage();
    const meteredMap = new Map<string, StoredUsage>();
    for (const entry of meteredList) {
      meteredMap.set(`${entry.chainFamily}:${entry.payer.toLowerCase()}`, entry);
    }

    const aggregated = new Map<
      string,
      {
        payer: string;
        chainFamily: X402ChainFamily;
        requests: number;
        spend: Record<string, number>;
        success: number;
        failed: number;
      }
    >();

    for (const record of settlements) {
      const payerKey =
        (this.ledger?.getRawPayer(record.idempotencyKey)) ??
        record.payerRedacted ??
        "unknown";
      const mapKey = `${record.chainFamily}:${payerKey.toLowerCase()}`;
      const entry = aggregated.get(mapKey) ?? {
        payer: payerKey,
        chainFamily: record.chainFamily,
        requests: 0,
        spend: {},
        success: 0,
        failed: 0,
      };

      entry.requests += 1;
      const isSuccess = record.status === "served" || record.status === "verified";
      if (isSuccess) {
        entry.success += 1;
      } else {
        entry.failed += 1;
      }

      const currentSpend = entry.spend[record.canonicalAsset] ?? 0;
      entry.spend[record.canonicalAsset] = currentSpend + Number(record.amount);
      aggregated.set(mapKey, entry);
    }

    const discrepancies: string[] = [];
    const summaries: UsageReconciliationSummary[] = [];

    const allKeys = new Set([...meteredMap.keys(), ...aggregated.keys()]);
    for (const key of allKeys) {
      const metered = meteredMap.get(key);
      const settled = aggregated.get(key);

      const meteredSpend = metered?.totalSpendByAsset ?? {};
      const settledSpend: Record<string, string> = {};
      if (settled) {
        for (const [asset, val] of Object.entries(settled.spend)) {
          settledSpend[asset] = val.toFixed(2);
        }
      }

      const meteredCount = metered?.totalRequests ?? 0;
      const settledCount = settled?.requests ?? 0;
      const meteredSuccess = metered?.successfulRequests ?? 0;
      const settledSuccess = settled?.success ?? 0;
      const meteredFailed = metered?.failedRequests ?? 0;
      const settledFailed = settled?.failed ?? 0;

      let isReconciled = true;
      if (meteredCount !== settledCount) {
        isReconciled = false;
        discrepancies.push(`Payer ${key} request count mismatch: metered ${meteredCount} vs settled ${settledCount}`);
      }
      if (meteredSuccess !== settledSuccess) {
        isReconciled = false;
        discrepancies.push(`Payer ${key} success count mismatch: metered ${meteredSuccess} vs settled ${settledSuccess}`);
      }
      if (meteredFailed !== settledFailed) {
        isReconciled = false;
        discrepancies.push(`Payer ${key} failed count mismatch: metered ${meteredFailed} vs settled ${settledFailed}`);
      }

      const allAssets = new Set([...Object.keys(meteredSpend), ...Object.keys(settledSpend)]);
      for (const asset of allAssets) {
        const m = Number(meteredSpend[asset] ?? "0");
        const s = Number(settledSpend[asset] ?? "0");
        if (Math.abs(m - s) > 0.0001) {
          isReconciled = false;
          discrepancies.push(`Payer ${key} asset ${asset} spend mismatch: metered ${m} vs settled ${s}`);
        }
      }

      const [chainFamily, ...rest] = key.split(":");
      summaries.push({
        payer: rest.join(":"),
        chainFamily: chainFamily as X402ChainFamily,
        meteredRequests: meteredCount,
        settledRequests: settledCount,
        meteredSpend,
        settledSpend,
        meteredSuccess,
        settledSuccess,
        meteredFailed,
        settledFailed,
        isReconciled,
      });
    }

    return {
      matches: discrepancies.length === 0,
      discrepancies,
      summaries,
    };
  }

  /**
   * Reconciles usage for a specific payer against ledger settlements.
   */
  async reconcileWithLedger(payer: string, chainFamily: X402ChainFamily): Promise<SinglePayerReconciliation> {
    const metered = await this.store.getUsage(payer);
    const meteredCount = metered?.totalRequests ?? 0;
    let meteredTotal = 0;
    if (metered?.totalSpendByAsset) {
      for (const val of Object.values(metered.totalSpendByAsset)) {
        meteredTotal += Number(val);
      }
    }

    const allSettlements = this.ledger ? this.ledger.list() : [];
    const payerSettlements = allSettlements.filter((s) => {
      const rawPayer = this.ledger?.getRawPayer(s.idempotencyKey);
      return (
        s.chainFamily === chainFamily &&
        (rawPayer?.toLowerCase() === payer.toLowerCase() ||
          s.payerRedacted?.toLowerCase() === payer.toLowerCase())
      );
    });

    const ledgerCount = payerSettlements.length;
    let ledgerTotal = 0;
    for (const s of payerSettlements) {
      ledgerTotal += Number(s.amount);
    }

    const discrepancy = meteredCount !== ledgerCount || Math.abs(meteredTotal - ledgerTotal) > 0.0001;

    return {
      discrepancy,
      meteredCount,
      ledgerCount,
      meteredTotal,
      ledgerTotal,
      details: discrepancy
        ? `Discrepancy detected: metered ${meteredCount} ($${meteredTotal.toFixed(2)}) vs ledger ${ledgerCount} ($${ledgerTotal.toFixed(2)})`
        : undefined,
    };
  }
}

export const usageTracker = new UsageTracker();
