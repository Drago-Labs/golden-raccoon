/**
 * Assigning each charge to the account the evidence says paid it.
 *
 * The rule is narrow on purpose: the payer is whoever the receipt or metadata
 * names. Where a record already carries fee metadata locally, that is used in
 * preference to spending a read — but it is never *merged* with a read: one
 * source of evidence per charge, named in the provenance, so a number can
 * always be traced to one place.
 */
import { readEvmCharge } from "./evmReceipt";
import { readStellarCharge, readingFromMeta } from "./stellarMeta";
import type { FeeCandidate } from "./transactionAdapter";
import type { FeeAsset, FeeCharge, FeeReader } from "./schema";

const EVM_NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  polygon: "POL",
  bsc: "BNB",
  avalanche: "AVAX",
  goat: "BTC",
};

function assetFor(candidate: FeeCandidate): FeeAsset {
  if (candidate.record.chainFamily === "stellar") {
    return { kind: "stellar_native", symbol: "XLM", network: candidate.record.network, decimals: 7 };
  }

  return {
    kind: "evm_native",
    symbol: EVM_NATIVE_SYMBOLS[candidate.record.network] ?? "native",
    network: candidate.record.network,
    decimals: 18,
  };
}

export async function attributeCharge(candidate: FeeCandidate, reader: FeeReader): Promise<FeeCharge> {
  const { record } = candidate;
  const asset = assetFor(candidate);

  const base = {
    chargeId: `${record.network}:${record.hash}`,
    hash: record.hash,
    network: record.network,
    chainFamily: record.chainFamily,
    category: candidate.category,
    occurredAt: candidate.occurredAt,
    asset,
    // A refund is only ever set from a field the chain reported. There is no
    // code path that infers one, because an inferred refund makes a total
    // smaller than the wallet actually paid.
    refundBaseUnits: null,
  };

  if (record.chainFamily === "stellar") {
    // Records that already carry Stellar fee metadata are read locally rather
    // than over the network: the same evidence, without spending a read.
    const local = record.stellarDetails;

    const reading =
      local?.feeCharged !== undefined
        ? readingFromMeta(
            {
              feeCharged: String(local.feeCharged),
              sourceAccount: record.sourceAccount,
              successful: candidate.outcome === "unknown" ? undefined : candidate.outcome === "succeeded",
            },
            record.hash,
          )
        : await readStellarCharge(reader, { hash: record.hash, network: record.network });

    return {
      ...base,
      outcome: reading.outcome === "unknown" ? candidate.outcome : reading.outcome,
      amountBaseUnits: reading.amountBaseUnits,
      evidence: reading.amountBaseUnits === null ? "unknown" : "observed",
      payer: reading.payer ?? record.sourceAccount ?? record.walletAddress ?? null,
      feeBumpPayer: reading.feeBumpPayer,
      originalSource: reading.originalSource,
      provenance: local?.feeCharged !== undefined ? `${reading.provenance} (from the stored record)` : reading.provenance,
      unknownReason: reading.unknownReason,
    };
  }

  const reading = await readEvmCharge(reader, { hash: record.hash, network: record.network });

  return {
    ...base,
    outcome: reading.outcome === "unknown" ? candidate.outcome : reading.outcome,
    amountBaseUnits: reading.amountBaseUnits,
    evidence: reading.amountBaseUnits === null ? "unknown" : "observed",
    payer: reading.payer ?? record.walletAddress ?? null,
    feeBumpPayer: null,
    originalSource: null,
    provenance: reading.provenance,
    unknownReason: reading.unknownReason,
  };
}
