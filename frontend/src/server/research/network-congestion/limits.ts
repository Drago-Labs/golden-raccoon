/**
 * Published bounds for one congestion explanation.
 *
 * A ledger closes about every five seconds, so 240 ledgers is roughly twenty
 * minutes. The timestamp search is centred on that same five-second spacing
 * and then bounded, so a slow close cannot turn into an unbounded scan.
 */
export const CONGESTION_LIMITS = {
  maxLedgers: 240,
  pageSize: 50,
  maxTransactionsPerLedger: 200,
  maxTransactionPages: 4,
  timeoutMs: 8_000,
  maxRequestBytes: 8_192,
  maxRadius: 20,
  defaultRadius: 4,
  maxTimestampProbes: 24,
  timestampSlackLedgers: 50_000,
  nominalCloseSeconds: 5,
} as const;
