/**
 * Read a bounded ledger window from Horizon.
 *
 * The host comes from the project's Stellar config, not from the request.
 * Transaction meta is decoded only to separate Soroban inclusion and resource
 * fees. A transaction whose meta cannot be classified is omitted from the
 * fee statistics rather than counted as a classic inclusion fee.
 */
import { xdr } from "@stellar/stellar-sdk";
import { getStellarDataApiUrls, getStellarNetwork } from "@/lib/stellar/config";
import { NetworkCongestionError } from "./errors";
import { CONGESTION_LIMITS } from "./limits";
import { assertPassphrase } from "./networkIdentity";
import type { NetworkRef, ObservedLedger, ObservedTransaction } from "./schema";
import { classicInclusionFee, splitSorobanFees } from "./sorobanFees";

export type LedgerHeader = {
  sequence: number;
  closedAt: string;
  maxOperations: number;
  txSetOperationCount: number;
  baseFeeStroops: number;
};

export type LedgerReadResult = {
  passphrase: string;
  ledgers: ObservedLedger[];
  truncated: boolean;
};

export type LedgerReader = {
  readLatest(network: NetworkRef): Promise<LedgerHeader>;
  readHeader(network: NetworkRef, sequence: number): Promise<LedgerHeader | null>;
  readRange(network: NetworkRef, fromSequence: number, toSequence: number): Promise<LedgerReadResult>;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type HorizonLedger = {
  sequence?: number;
  closed_at?: string;
  tx_set_operation_count?: number;
  operation_count?: number;
  max_tx_set_size?: number;
  base_fee_in_stroops?: number | string;
  paging_token?: string;
};

type HorizonTransaction = {
  hash?: string;
  successful?: boolean;
  operation_count?: number;
  fee_charged?: string | number;
  result_meta_xdr?: string;
  paging_token?: string;
};

export type HorizonReaderOptions = {
  fetchImpl?: FetchLike;
  pageSize?: number;
  maxTransactionsPerLedger?: number;
  timeoutMs?: number;
};

type SorobanExt = { type: string; v1?: { totalNonRefundableResourceFeeCharged: bigint; totalRefundableResourceFeeCharged: bigint; rentFeeCharged: bigint } };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function recordsOf<T>(body: unknown): T[] {
  if (!body || typeof body !== "object") return [];

  const embedded = (body as { _embedded?: { records?: T[] } })._embedded;

  return Array.isArray(embedded?.records) ? embedded.records : [];
}

function integerInRange(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < min || parsed > max) return null;

  return parsed;
}

function stroopString(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
    return String(value);
  }

  if (typeof value === "string" && /^\d{1,20}$/.test(value)) return value;

  return null;
}

function toHeader(raw: HorizonLedger): LedgerHeader | null {
  const sequence = integerInRange(raw.sequence, 1, 2_000_000_000);
  const maxOperations = integerInRange(raw.max_tx_set_size, 0, 10_000_000);
  const operationCount = integerInRange(raw.tx_set_operation_count ?? raw.operation_count, 0, 10_000_000);
  const baseFeeStroops = integerInRange(raw.base_fee_in_stroops, 0, 1_000_000_000);

  if (sequence === null || maxOperations === null || operationCount === null || baseFeeStroops === null) return null;
  if (typeof raw.closed_at !== "string" || !Number.isFinite(Date.parse(raw.closed_at))) return null;

  return { sequence, closedAt: raw.closed_at, maxOperations, txSetOperationCount: operationCount, baseFeeStroops };
}

function sorobanExtension(meta: xdr.TransactionMeta): SorobanExt | null | "classic" {
  if (meta.type === "v3") {
    return meta.v3.sorobanMeta ? meta.v3.sorobanMeta.ext : "classic";
  }

  if (meta.type === "v4") {
    return meta.v4.sorobanMeta ? meta.v4.sorobanMeta.ext : "classic";
  }

  return "classic";
}

/**
 * Classify one Horizon transaction.
 *
 * Without meta, the fee is omitted. A Soroban meta that cannot be split is
 * kept as `unsplit` so its total cannot be reported as a classic inclusion fee.
 */
export function classifyHorizonTransaction(raw: HorizonTransaction): { transaction: ObservedTransaction } | { omitted: true } {
  if (typeof raw.hash !== "string" || raw.hash.trim().length === 0 || raw.hash.length > 128) return { omitted: true };

  const operationCount = integerInRange(raw.operation_count, 1, 100_000);
  const feeCharged = stroopString(raw.fee_charged);

  if (operationCount === null || feeCharged === null) return { omitted: true };

  const base = {
    hash: raw.hash,
    operationCount,
    successful: raw.successful === true,
  };

  if (typeof raw.result_meta_xdr !== "string" || raw.result_meta_xdr.length === 0) return { omitted: true };

  let extension: SorobanExt | null | "classic";

  try {
    extension = sorobanExtension(xdr.TransactionMeta.fromXdr(raw.result_meta_xdr, "base64"));
  } catch {
    return {
      transaction: {
        ...base,
        classicInclusionFeeStroops: null,
        sorobanInclusionFeeStroops: null,
        sorobanResourceFeeStroops: null,
        sorobanRentFeeStroops: null,
        split: "unsplit",
      },
    };
  }

  if (extension === "classic") {
    const classic = classicInclusionFee(BigInt(feeCharged));

    if (!classic) return { omitted: true };

    return {
      transaction: {
        ...base,
        classicInclusionFeeStroops: classic.inclusionFeeStroops.toString(),
        sorobanInclusionFeeStroops: null,
        sorobanResourceFeeStroops: null,
        sorobanRentFeeStroops: null,
        split: "classic",
      },
    };
  }

  if (!extension || extension.type !== "v1" || !extension.v1) {
    return {
      transaction: {
        ...base,
        classicInclusionFeeStroops: null,
        sorobanInclusionFeeStroops: null,
        sorobanResourceFeeStroops: null,
        sorobanRentFeeStroops: null,
        split: "unsplit",
      },
    };
  }

  const split = splitSorobanFees({
    feeChargedStroops: BigInt(feeCharged),
    nonRefundableStroops: extension.v1.totalNonRefundableResourceFeeCharged,
    refundableStroops: extension.v1.totalRefundableResourceFeeCharged,
    rentStroops: extension.v1.rentFeeCharged,
  });

  if (!split.ok) {
    return {
      transaction: {
        ...base,
        classicInclusionFeeStroops: null,
        sorobanInclusionFeeStroops: null,
        sorobanResourceFeeStroops: null,
        sorobanRentFeeStroops: null,
        split: "unsplit",
      },
    };
  }

  return {
    transaction: {
      ...base,
      classicInclusionFeeStroops: null,
      sorobanInclusionFeeStroops: split.inclusionFeeStroops.toString(),
      sorobanResourceFeeStroops: split.resourceFeeStroops.toString(),
      sorobanRentFeeStroops: split.rentStroops.toString(),
      split: "soroban",
    },
  };
}

export function createHorizonLedgerReader(options: HorizonReaderOptions = {}): LedgerReader {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? CONGESTION_LIMITS.pageSize;
  const maxTransactionsPerLedger = options.maxTransactionsPerLedger ?? CONGESTION_LIMITS.maxTransactionsPerLedger;
  const timeoutMs = options.timeoutMs ?? CONGESTION_LIMITS.timeoutMs;

  function endpoint(network: NetworkRef): string {
    const config = getStellarNetwork(network.id);

    if (!config) {
      throw new NetworkCongestionError("unknown_network", `No Stellar data API is configured for ${network.id}.`);
    }

    assertPassphrase(network, config.networkPassphrase);
    const [url] = getStellarDataApiUrls(config);

    if (!url) {
      throw new NetworkCongestionError("provider_unavailable", `No Horizon URL is configured for ${network.id}.`);
    }

    return url.replace(/\/$/, "");
  }

  async function getJson(url: URL): Promise<{ status: number; body: unknown }> {
    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404) return { status: 404, body: null };

      if (!response.ok) {
        throw new NetworkCongestionError("provider_unavailable", `Horizon returned HTTP ${response.status} for ${url.pathname}.`);
      }

      return { status: response.status, body: await response.json() };
    } catch (error) {
      if (error instanceof NetworkCongestionError) throw error;

      if (isTimeout(error)) {
        throw new NetworkCongestionError("provider_timeout", "The ledger read exceeded the published timeout.");
      }

      throw new NetworkCongestionError("provider_unavailable", "The ledger provider could not be read.");
    }
  }

  async function readHeader(network: NetworkRef, sequence: number): Promise<LedgerHeader | null> {
    const url = new URL(`/ledgers/${sequence}`, endpoint(network));
    const { status, body } = await getJson(url);

    if (status === 404 || !body) return null;

    const header = toHeader(body as HorizonLedger);

    if (!header) {
      throw new NetworkCongestionError("provider_unavailable", `Ledger ${sequence} could not be read.`);
    }

    return header;
  }

  async function readLatest(network: NetworkRef): Promise<LedgerHeader> {
    const url = new URL("/ledgers", endpoint(network));
    url.searchParams.set("order", "desc");
    url.searchParams.set("limit", "1");
    const { body } = await getJson(url);
    const header = toHeader(recordsOf<HorizonLedger>(body)[0] ?? {});

    if (!header) {
      throw new NetworkCongestionError("provider_unavailable", "The latest ledger could not be read.");
    }

    return header;
  }

  async function readTransactions(base: string, sequence: number): Promise<{ transactions: ObservedTransaction[]; omitted: number; truncated: boolean }> {
    const transactions: ObservedTransaction[] = [];
    let omitted = 0;
    let cursor = "";
    let pages = 0;
    const seen = new Set<string>();

    while (pages < CONGESTION_LIMITS.maxTransactionPages && transactions.length < maxTransactionsPerLedger) {
      if (seen.has(cursor)) return { transactions, omitted, truncated: true };

      seen.add(cursor);
      pages += 1;
      const url = new URL(`/ledgers/${sequence}/transactions`, base);
      url.searchParams.set("order", "asc");
      url.searchParams.set("limit", String(Math.min(pageSize, maxTransactionsPerLedger - transactions.length)));

      if (cursor) url.searchParams.set("cursor", cursor);

      const { body } = await getJson(url);
      const records = recordsOf<HorizonTransaction>(body);

      if (records.length === 0) return { transactions, omitted, truncated: false };

      for (const record of records) {
        if (transactions.length >= maxTransactionsPerLedger) {
          return { transactions, omitted, truncated: true };
        }

        const classified = classifyHorizonTransaction(record);

        if ("omitted" in classified) omitted += 1;
        else transactions.push(classified.transaction);
      }

      if (records.length < Number(url.searchParams.get("limit"))) {
        return { transactions, omitted, truncated: false };
      }

      const last = records[records.length - 1];
      cursor = String(last?.paging_token ?? "");

      if (!cursor) return { transactions, omitted, truncated: true };
    }

    return { transactions, omitted, truncated: true };
  }

  async function readRange(network: NetworkRef, fromSequence: number, toSequence: number): Promise<LedgerReadResult> {
    const base = endpoint(network);
    const ledgers: ObservedLedger[] = [];
    let cursor = String(fromSequence - 1);
    let pages = 0;
    let truncated = false;
    const seen = new Set<string>();
    const maxPages = Math.min(CONGESTION_LIMITS.maxLedgers, Math.ceil((toSequence - fromSequence + 1) / pageSize) + 2);

    while (pages < maxPages) {
      if (seen.has(cursor)) {
        truncated = true;
        break;
      }

      seen.add(cursor);
      pages += 1;
      const url = new URL("/ledgers", base);
      url.searchParams.set("order", "asc");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("cursor", cursor);
      const { body } = await getJson(url);
      const records = recordsOf<HorizonLedger>(body);

      if (records.length === 0) break;

      let passedEnd = false;

      for (const record of records) {
        const header = toHeader(record);

        if (!header || header.sequence < fromSequence) continue;

        if (header.sequence > toSequence) {
          passedEnd = true;
          break;
        }

        const transactions = await readTransactions(base, header.sequence);
        if (transactions.truncated) truncated = true;

        ledgers.push({
          sequence: header.sequence,
          closedAt: header.closedAt,
          operationCount: header.txSetOperationCount,
          maxOperations: header.maxOperations,
          baseFeeStroops: header.baseFeeStroops,
          transactions: transactions.transactions,
          omittedTransactionCount: transactions.omitted,
        });
      }

      const last = records[records.length - 1];
      const lastSequence = integerInRange(last?.sequence, 1, 2_000_000_000) ?? 0;

      if (passedEnd || lastSequence >= toSequence || records.length < pageSize) break;

      const nextCursor = String(last?.paging_token ?? lastSequence);

      if (!nextCursor || nextCursor === cursor) {
        truncated = true;
        break;
      }

      cursor = nextCursor;
    }

    if (pages >= maxPages && (ledgers.length === 0 || ledgers[ledgers.length - 1].sequence < toSequence)) {
      truncated = true;
    }

    return { passphrase: network.passphrase, ledgers, truncated };
  }

  return { readLatest, readHeader, readRange };
}
