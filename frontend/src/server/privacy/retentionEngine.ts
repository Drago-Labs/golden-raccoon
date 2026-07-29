import { getPrivacyRetentionConfig, getRetentionCutoffDate } from "@/server/privacy/config";
import { pruneExpiredRecordsFromPg } from "@/server/storage/postgresAdapter";

type GoldenRaccoonMemoryGlobal = typeof globalThis & {
  __goldenRaccoonAgentRuns?: Array<{ createdAt: string }>;
  __goldenRaccoonAlertObservations?: Array<{ createdAt: string }>;
  __goldenRaccoonAlerts?: Array<{ triggeredAt: string }>;
  __goldenRaccoonWatchlistScanRuns?: Array<{ scannedAt: string }>;
  __goldenRaccoonTransactions?: Array<{ createdAt: string; walletAddress?: string; sourceAccount?: string }>;
  __goldenRaccoonX402PaymentReceipts?: Array<{ createdAt: string; walletAddress?: string; payer?: string }>;
};

export async function pruneExpiredStorageData(now = new Date()): Promise<{
  prunedMemoryCount: number;
  unlinkedMemoryAuditCount: number;
  pgPrunedCount: number;
  pgUnlinkedCount: number;
}> {
  const config = getPrivacyRetentionConfig();

  const agentRunsCutoff = getRetentionCutoffDate(config.agentRunsDays, now);
  const alertObservationsCutoff = getRetentionCutoffDate(config.alertObservationsDays, now);
  const alertsCutoff = getRetentionCutoffDate(config.alertsDays, now);
  const watchlistScanRunsCutoff = getRetentionCutoffDate(config.watchlistRunsDays, now);
  const transactionsUnlinkCutoff = getRetentionCutoffDate(config.transactionsUnlinkDays, now);
  const x402ReceiptsUnlinkCutoff = getRetentionCutoffDate(config.x402ReceiptsUnlinkDays, now);

  const memory = globalThis as GoldenRaccoonMemoryGlobal;
  let prunedMemoryCount = 0;
  let unlinkedMemoryAuditCount = 0;

  if (memory.__goldenRaccoonAgentRuns) {
    const before = memory.__goldenRaccoonAgentRuns.length;
    memory.__goldenRaccoonAgentRuns = memory.__goldenRaccoonAgentRuns.filter(
      (run) => new Date(run.createdAt) >= agentRunsCutoff
    );
    prunedMemoryCount += before - memory.__goldenRaccoonAgentRuns.length;
  }

  if (memory.__goldenRaccoonAlertObservations) {
    const before = memory.__goldenRaccoonAlertObservations.length;
    memory.__goldenRaccoonAlertObservations = memory.__goldenRaccoonAlertObservations.filter(
      (obs) => new Date(obs.createdAt) >= alertObservationsCutoff
    );
    prunedMemoryCount += before - memory.__goldenRaccoonAlertObservations.length;
  }

  if (memory.__goldenRaccoonAlerts) {
    const before = memory.__goldenRaccoonAlerts.length;
    memory.__goldenRaccoonAlerts = memory.__goldenRaccoonAlerts.filter(
      (alt) => new Date(alt.triggeredAt) >= alertsCutoff
    );
    prunedMemoryCount += before - memory.__goldenRaccoonAlerts.length;
  }

  if (memory.__goldenRaccoonWatchlistScanRuns) {
    const before = memory.__goldenRaccoonWatchlistScanRuns.length;
    memory.__goldenRaccoonWatchlistScanRuns = memory.__goldenRaccoonWatchlistScanRuns.filter(
      (w) => new Date(w.scannedAt) >= watchlistScanRunsCutoff
    );
    prunedMemoryCount += before - memory.__goldenRaccoonWatchlistScanRuns.length;
  }

  if (memory.__goldenRaccoonTransactions) {
    for (const tx of memory.__goldenRaccoonTransactions) {
      if (new Date(tx.createdAt) < transactionsUnlinkCutoff && tx.walletAddress) {
        tx.walletAddress = undefined;
        tx.sourceAccount = undefined;
        unlinkedMemoryAuditCount++;
      }
    }
  }

  if (memory.__goldenRaccoonX402PaymentReceipts) {
    for (const rec of memory.__goldenRaccoonX402PaymentReceipts) {
      if (new Date(rec.createdAt) < x402ReceiptsUnlinkCutoff && rec.walletAddress) {
        rec.walletAddress = undefined;
        rec.payer = undefined;
        unlinkedMemoryAuditCount++;
      }
    }
  }

  let pgPrunedCount = 0;
  let pgUnlinkedCount = 0;

  try {
    const pgResult = await pruneExpiredRecordsFromPg({
      agentRunsCutoff,
      alertObservationsCutoff,
      alertsCutoff,
      watchlistScanRunsCutoff,
      transactionsUnlinkCutoff,
      x402ReceiptsUnlinkCutoff,
    });
    pgPrunedCount = pgResult.prunedCount;
    pgUnlinkedCount = pgResult.unlinkedCount;
  } catch {
    // best-effort PG pruning
  }

  return {
    prunedMemoryCount,
    unlinkedMemoryAuditCount,
    pgPrunedCount,
    pgUnlinkedCount,
  };
}
