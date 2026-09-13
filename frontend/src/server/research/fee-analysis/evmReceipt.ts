/**
 * EVM gas charges, read from a receipt.
 *
 * The charge is `gasUsed × effectiveGasPrice`, plus the rollup L1 data fee
 * where the network reports one. A failed transaction has a receipt and a
 * charge — gas is spent on reverting too — so `status: 0x0` narrows the
 * outcome without removing the charge.
 *
 * A missing field makes the charge `unknown`. It never makes it zero.
 */
import { addBaseUnits, multiply, parseAmount } from "./unitMath";
import type { EvmReceiptRaw, FeeReader } from "./schema";

export type EvmChargeReading = {
  amountBaseUnits: string | null;
  payer: string | null;
  outcome: "succeeded" | "failed" | "unknown";
  provenance: string;
  unknownReason: string | null;
};

export function readingFromReceipt(receipt: EvmReceiptRaw, hash: string): EvmChargeReading {
  const gasUsed = parseAmount(receipt.gasUsed);
  const gasPrice = parseAmount(receipt.effectiveGasPrice);
  const l1Fee = parseAmount(receipt.l1Fee);

  const outcome =
    receipt.status === undefined
      ? "unknown"
      : receipt.status === "0x1" || receipt.status === "1"
        ? "succeeded"
        : "failed";

  if (gasUsed === null || gasPrice === null) {
    return {
      amountBaseUnits: null,
      payer: receipt.from?.toLowerCase() ?? null,
      outcome,
      provenance: `receipt for ${hash}`,
      unknownReason:
        gasUsed === null && gasPrice === null
          ? "The receipt carried neither gasUsed nor effectiveGasPrice."
          : gasUsed === null
            ? "The receipt carried no gasUsed."
            : "The receipt carried no effectiveGasPrice.",
    };
  }

  const execution = multiply(gasUsed.toString(), gasPrice.toString());
  const total = l1Fee === null ? execution : addBaseUnits(execution, l1Fee.toString());

  return {
    amountBaseUnits: total,
    payer: receipt.from?.toLowerCase() ?? null,
    outcome,
    provenance:
      l1Fee === null
        ? `receipt for ${hash}: gasUsed ${gasUsed} × effectiveGasPrice ${gasPrice}`
        : `receipt for ${hash}: gasUsed ${gasUsed} × effectiveGasPrice ${gasPrice}, plus L1 data fee ${l1Fee}`,
    unknownReason: null,
  };
}

export async function readEvmCharge(
  reader: FeeReader,
  input: { hash: string; network: string },
): Promise<EvmChargeReading> {
  try {
    return readingFromReceipt(await reader.readEvmReceipt(input), input.hash);
  } catch (error) {
    return {
      amountBaseUnits: null,
      payer: null,
      outcome: "unknown",
      provenance: `receipt read for ${input.hash}`,
      unknownReason: error instanceof Error ? error.message.slice(0, 200) : "The receipt read did not complete.",
    };
  }
}

/**
 * The receipt source used in production.
 *
 * It goes through the project's own EVM client factory, so the RPC endpoint
 * comes from the server's network configuration and never from a request. The
 * only method used is `getTransactionReceipt` — a read of a transaction that
 * has already happened.
 */
export function createEvmReceiptSource(): (input: { hash: string; network: string }) => Promise<EvmReceiptRaw> {
  return async ({ hash, network }) => {
    const { createEvmPublicClient } = await import("@/server/transactions/adapters/evm");
    const client = createEvmPublicClient({ family: "evm", network });

    if (!client) throw new Error(`No EVM client is configured for ${network}.`);

    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });

    return {
      gasUsed: receipt.gasUsed === undefined ? undefined : `0x${receipt.gasUsed.toString(16)}`,
      effectiveGasPrice: receipt.effectiveGasPrice === undefined ? undefined : `0x${receipt.effectiveGasPrice.toString(16)}`,
      l1Fee:
        (receipt as unknown as { l1Fee?: bigint }).l1Fee === undefined
          ? undefined
          : `0x${(receipt as unknown as { l1Fee: bigint }).l1Fee.toString(16)}`,
      from: receipt.from,
      status: receipt.status === "success" ? "0x1" : "0x0",
    };
  };
}
