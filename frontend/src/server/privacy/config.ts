/**
 * Privacy & Data Retention Configuration for Golden Raccoon.
 * Provides conservative production defaults backed by environment variable overrides.
 */

export interface PrivacyRetentionConfig {
  /** Days to retain agent run records and detailed evaluation signals. Default: 90 days. */
  agentRunsDays: number;
  /** Days to retain raw alert observation signals. Default: 30 days. */
  alertObservationsDays: number;
  /** Days to retain alert history records. Default: 90 days. */
  alertsDays: number;
  /** Days to retain watchlist scan run history. Default: 90 days. */
  watchlistRunsDays: number;
  /** Days before transactions are unlinked from wallet identity for audit preservation. Default: 365 days. */
  transactionsUnlinkDays: number;
  /** Days before X402 payment receipts are unlinked from wallet identity for accounting compliance. Default: 1095 days (3 years). */
  x402ReceiptsUnlinkDays: number;
}

function parseEnvInt(envName: string, defaultValue: number): number {
  const raw = process.env[envName];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function getPrivacyRetentionConfig(): PrivacyRetentionConfig {
  return {
    agentRunsDays: parseEnvInt("RETENTION_AGENT_RUNS_DAYS", 90),
    alertObservationsDays: parseEnvInt("RETENTION_ALERT_OBSERVATIONS_DAYS", 30),
    alertsDays: parseEnvInt("RETENTION_ALERTS_DAYS", 90),
    watchlistRunsDays: parseEnvInt("RETENTION_WATCHLIST_RUNS_DAYS", 90),
    transactionsUnlinkDays: parseEnvInt("RETENTION_TRANSACTIONS_UNLINK_DAYS", 365),
    x402ReceiptsUnlinkDays: parseEnvInt("RETENTION_X402_RECEIPTS_UNLINK_DAYS", 1095),
  };
}

export function getRetentionCutoffDate(days: number, now = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}
