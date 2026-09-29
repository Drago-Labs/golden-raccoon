/**
 * Fixtures for fee attribution.
 *
 * Records are plain `TransactionRecord` objects and the reader is a map from
 * hash to what a receipt or metadata read would have returned. No chain, no
 * storage and no clock are involved, so every assertion below is checkable by
 * reading the numbers in this file.
 */
import type { TransactionRecord } from "@/server/types";
import type { EvmReceiptRaw, FeeReader, StellarMetaRaw } from "@/server/research/fee-analysis/schema";

export const WALLET = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
export const OTHER_WALLET = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

export const STELLAR_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const STELLAR_FEE_PAYER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBLFO";

export const WINDOW = { from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" };

function record(overrides: Partial<TransactionRecord> & Pick<TransactionRecord, "hash">): TransactionRecord {
  return {
    type: "swap",
    asset: "USDC",
    valueUsd: 100,
    status: "confirmed",
    lifecycleStatus: "confirmed",
    chainFamily: "evm",
    createdAt: "2026-02-10T10:00:00.000Z",
    terminalAt: "2026-02-10T10:01:00.000Z",
    network: "ethereum",
    walletAddress: WALLET,
    ...overrides,
  } as TransactionRecord;
}

/** A confirmed swap on Ethereum. */
export const EVM_SUCCESS = record({ hash: "0xaaa1" });

/**
 * A reverted approval.
 *
 * Gas is spent on reverting, so this record must stay in the totals — it is
 * the case a naive "only count successes" filter gets wrong.
 */
export const EVM_FAILED = record({
  hash: "0xaaa2",
  type: "approval",
  status: "failed",
  lifecycleStatus: "failed",
  terminalAt: "2026-02-11T09:00:00.000Z",
});

/** A transaction that was sped up: this hash was superseded. */
export const EVM_REPLACED = record({
  hash: "0xaaa3",
  status: "replaced",
  lifecycleStatus: "replaced",
  replacementHash: "0xaaa4",
  terminalAt: "2026-02-12T08:00:00.000Z",
});

/** The replacement that actually landed. */
export const EVM_REPLACEMENT = record({
  hash: "0xaaa4",
  terminalAt: "2026-02-12T08:02:00.000Z",
});

/** Still in flight: no final charge exists yet. */
export const EVM_PENDING = record({
  hash: "0xaaa5",
  status: "submitted",
  lifecycleStatus: "submitted",
  terminalAt: undefined,
  createdAt: "2026-02-20T08:00:00.000Z",
});

/** Belongs to a different wallet. */
export const EVM_OTHER_WALLET = record({ hash: "0xaaa6", walletAddress: OTHER_WALLET });

/** Outside the requested window. */
export const EVM_OUT_OF_WINDOW = record({
  hash: "0xaaa7",
  createdAt: "2025-12-01T00:00:00.000Z",
  terminalAt: "2025-12-01T00:01:00.000Z",
});

/** A confirmed transfer on Base, so the report spans two networks. */
export const EVM_BASE = record({
  hash: "0xaaa8",
  type: "transfer",
  network: "base",
  terminalAt: "2026-02-14T12:00:00.000Z",
});

/** A Stellar trustline change carrying its fee locally. */
export const STELLAR_LOCAL_FEE = record({
  hash: "stellar-1",
  type: "trustline_create",
  chainFamily: "stellar",
  network: "pubnet",
  walletAddress: undefined,
  sourceAccount: STELLAR_SOURCE,
  terminalAt: "2026-02-15T10:00:00.000Z",
  stellarDetails: { feeCharged: 100, operationCount: 1 },
});

/** A Stellar transaction whose fee was paid by another account. */
export const STELLAR_FEE_BUMP = record({
  hash: "stellar-2",
  type: "transfer",
  chainFamily: "stellar",
  network: "pubnet",
  walletAddress: undefined,
  sourceAccount: STELLAR_SOURCE,
  terminalAt: "2026-02-16T10:00:00.000Z",
});

/** A Soroban transaction with a resource fee on top of the base fee. */
export const STELLAR_RESOURCE_FEE = record({
  hash: "stellar-3",
  type: "swap",
  chainFamily: "stellar",
  network: "pubnet",
  walletAddress: undefined,
  sourceAccount: STELLAR_SOURCE,
  terminalAt: "2026-02-17T10:00:00.000Z",
});

/** An EVM transaction whose receipt will come back without a gas price. */
export const EVM_UNREADABLE = record({ hash: "0xbbb1", terminalAt: "2026-02-18T10:00:00.000Z" });

export type FeeWorld = {
  receipts?: Record<string, EvmReceiptRaw | Error>;
  meta?: Record<string, StellarMetaRaw | Error>;
};

export type CountingFeeReader = FeeReader & { readCount: () => number; log: () => string[] };

export function createFeeReader(world: FeeWorld): CountingFeeReader {
  let count = 0;
  const log: string[] = [];

  return {
    readCount: () => count,
    log: () => [...log],

    async readEvmReceipt({ hash }) {
      count += 1;
      log.push(`receipt ${hash}`);

      const entry = world.receipts?.[hash];

      if (entry instanceof Error) throw entry;
      if (!entry) throw new Error(`No receipt for ${hash}.`);

      return entry;
    },

    async readStellarMeta({ hash }) {
      count += 1;
      log.push(`meta ${hash}`);

      const entry = world.meta?.[hash];

      if (entry instanceof Error) throw entry;
      if (!entry) throw new Error(`No metadata for ${hash}.`);

      return entry;
    },
  };
}

/** 21,000 gas at 20 gwei = 420,000,000,000,000 wei exactly. */
export const SIMPLE_RECEIPT: EvmReceiptRaw = {
  gasUsed: "0x5208",
  effectiveGasPrice: "0x4a817c800",
  from: WALLET,
  status: "0x1",
};

/** A reverted receipt: a real charge with a failed outcome. */
export const FAILED_RECEIPT: EvmReceiptRaw = {
  gasUsed: "0x5208",
  effectiveGasPrice: "0x4a817c800",
  from: WALLET,
  status: "0x0",
};

/** An L2 receipt with a separate L1 data fee. */
export const L2_RECEIPT: EvmReceiptRaw = {
  gasUsed: "0x5208",
  effectiveGasPrice: "0x3b9aca00",
  l1Fee: "0x1bc16d674ec80000",
  from: WALLET,
  status: "0x1",
};

/** A receipt missing the price: the charge is unknown, not zero. */
export const PRICELESS_RECEIPT: EvmReceiptRaw = { gasUsed: "0x5208", from: WALLET, status: "0x1" };

export const FEE_BUMP_META: StellarMetaRaw = {
  feeCharged: "200",
  feeAccount: STELLAR_FEE_PAYER,
  sourceAccount: STELLAR_SOURCE,
  successful: true,
};

export const RESOURCE_FEE_META: StellarMetaRaw = {
  feeCharged: "100",
  resourceFeeCharged: "4321",
  sourceAccount: STELLAR_SOURCE,
  successful: true,
};

export const FULL_WORLD: FeeWorld = {
  receipts: {
    "0xaaa1": SIMPLE_RECEIPT,
    "0xaaa2": FAILED_RECEIPT,
    "0xaaa4": SIMPLE_RECEIPT,
    "0xaaa8": L2_RECEIPT,
    "0xbbb1": PRICELESS_RECEIPT,
  },
  meta: {
    "stellar-2": FEE_BUMP_META,
    "stellar-3": RESOURCE_FEE_META,
  },
};

export function request(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: WALLET,
    stellarAccount: STELLAR_SOURCE,
    from: WINDOW.from,
    to: WINDOW.to,
    bucket: "day",
    conversions: [],
    ...overrides,
  };
}

export const ETH_PRICE = {
  assetKind: "evm_native" as const,
  network: "ethereum",
  unitPriceUsd: 2000,
  pricedAt: "2026-03-01T00:00:00.000Z",
};

export const XLM_PRICE = {
  assetKind: "stellar_native" as const,
  network: "pubnet",
  unitPriceUsd: 0.1,
  pricedAt: "2026-03-01T00:00:00.000Z",
};
