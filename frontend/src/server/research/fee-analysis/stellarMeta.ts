/**
 * Stellar fee charges, read from transaction metadata.
 *
 * Stellar reports the fee actually charged, in stroops, which is simpler than
 * the EVM's multiplication — but it carries one complication the EVM does not:
 * under a fee bump, the account that pays is *not* the transaction's source.
 * Both are read, and both are reported, so an analysis by payer does not
 * silently bill the wrong account.
 *
 * A Soroban resource fee, when the metadata reports one, is added to the
 * charge rather than shown apart, because the ledger charged it as one amount.
 */
import { addBaseUnits, parseAmount } from "./unitMath";
import type { FeeReader, StellarMetaRaw } from "./schema";

export type StellarChargeReading = {
  amountBaseUnits: string | null;
  /** The account the ledger charged. */
  payer: string | null;
  /** Set only when the payer differs from the transaction's own source. */
  feeBumpPayer: string | null;
  originalSource: string | null;
  outcome: "succeeded" | "failed" | "unknown";
  provenance: string;
  unknownReason: string | null;
};

export function readingFromMeta(meta: StellarMetaRaw, hash: string): StellarChargeReading {
  const feeCharged = parseAmount(meta.feeCharged);
  const resourceFee = parseAmount(meta.resourceFeeCharged);

  const source = meta.sourceAccount ?? null;
  const feeAccount = meta.feeAccount ?? null;
  const isFeeBump = feeAccount !== null && source !== null && feeAccount !== source;

  const outcome = meta.successful === undefined ? "unknown" : meta.successful ? "succeeded" : "failed";

  if (feeCharged === null) {
    return {
      amountBaseUnits: null,
      payer: feeAccount ?? source,
      feeBumpPayer: isFeeBump ? feeAccount : null,
      originalSource: isFeeBump ? source : null,
      outcome,
      provenance: `transaction metadata for ${hash}`,
      unknownReason: "The metadata carried no feeCharged value.",
    };
  }

  const total = resourceFee === null ? feeCharged.toString() : addBaseUnits(feeCharged.toString(), resourceFee.toString());

  return {
    amountBaseUnits: total,
    payer: feeAccount ?? source,
    feeBumpPayer: isFeeBump ? feeAccount : null,
    originalSource: isFeeBump ? source : null,
    outcome,
    provenance:
      resourceFee === null
        ? `transaction metadata for ${hash}: feeCharged ${feeCharged} stroops`
        : `transaction metadata for ${hash}: feeCharged ${feeCharged} stroops plus resource fee ${resourceFee} stroops`,
    unknownReason: null,
  };
}

export async function readStellarCharge(
  reader: FeeReader,
  input: { hash: string; network: string },
): Promise<StellarChargeReading> {
  try {
    return readingFromMeta(await reader.readStellarMeta(input), input.hash);
  } catch (error) {
    return {
      amountBaseUnits: null,
      payer: null,
      feeBumpPayer: null,
      originalSource: null,
      outcome: "unknown",
      provenance: `metadata read for ${input.hash}`,
      unknownReason: error instanceof Error ? error.message.slice(0, 200) : "The metadata read did not complete.",
    };
  }
}

/**
 * The metadata source used in production.
 *
 * Horizon's transaction resource carries `fee_charged`, `fee_account` and
 * `source_account` — everything the attribution needs, including the fee-bump
 * distinction. The endpoint is resolved from the project's Stellar config, so
 * a request cannot aim this at an arbitrary host.
 */
export function createStellarMetaSource(): (input: { hash: string; network: string }) => Promise<StellarMetaRaw> {
  return async ({ hash, network }) => {
    const { getStellarNetwork } = await import("@/lib/stellar/config");
    const config = getStellarNetwork(network);

    if (!config) throw new Error(`No Stellar network is configured for ${network}.`);

    const response = await fetch(`${config.dataApiUrl}/transactions/${encodeURIComponent(hash)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Horizon returned HTTP ${response.status} for ${hash}.`);

    const payload = (await response.json()) as {
      fee_charged?: string | number;
      fee_account?: string;
      source_account?: string;
      successful?: boolean;
      created_at?: string;
    };

    return {
      feeCharged: payload.fee_charged === undefined ? undefined : String(payload.fee_charged),
      feeAccount: payload.fee_account,
      sourceAccount: payload.source_account,
      successful: payload.successful,
      createdAt: payload.created_at,
    };
  };
}
