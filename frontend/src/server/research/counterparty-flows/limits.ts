export const COUNTERPARTY_FLOW_LIMITS = {
  maxRequestBytes: 16_384,
  maxResponseBytes: 1_000_000,
  timeoutMs: 8_000,
  pageSize: 200,
  maxPages: 5,
  maxEvents: 1_000,
  maxWindowDays: 90,
  topNs: [1, 3, 5, 10] as const,
  amountScale: 10_000_000n,
  decimalPlaces: 7,
} as const;
