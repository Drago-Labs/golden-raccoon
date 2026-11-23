import type { Deployment, EvmDeployment, StablecoinAsset, StellarDeployment } from "./assetRegistry";
import { StablecoinFlowError } from "./errors";
import type { FlowDirection, FlowEvent } from "./schema";
import { dayOf } from "./windowing";

/** One zero-address ERC-20 Transfer, exactly as the log reported it. */
export type RawEvmFlowEvent = {
  direction: FlowDirection;
  /** Hex or decimal integer string of the transferred amount, in the token's own decimals. */
  amount: string;
  blockNumber: number;
  /** Seconds since the epoch, as the block reported them. */
  blockTimestamp: number;
  txHash: string;
  logIndex: number;
};

/** One Horizon payment to or from the issuing account. */
export type RawStellarPayment = {
  id: string;
  type: string;
  asset_code?: string;
  asset_issuer?: string;
  from?: string;
  to?: string;
  amount?: string;
  created_at?: string;
  transaction_hash?: string;
};

/**
 * Rescales an integer amount between decimal scales. Only exact upscaling is
 * allowed: the canonical scale of an asset is the largest of its deployments,
 * so no amount is ever divided and no digit is ever lost.
 */
export function scaleUnits(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (toDecimals < fromDecimals) {
    throw new StablecoinFlowError(
      "malformed_response",
      `Refusing to rescale an amount from ${fromDecimals} to ${toDecimals} decimals, which would drop digits.`,
    );
  }
  return amount * 10n ** BigInt(toDecimals - fromDecimals);
}

/** Renders integer units as a decimal string without trailing zeros. */
export function decimalFromUnits(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${sign}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}

export function parseIntegerAmount(value: string): bigint {
  const text = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(text)) return BigInt(text);
  if (/^\d+$/.test(text)) return BigInt(text);
  throw new StablecoinFlowError("malformed_response", `"${value}" is not a usable integer amount.`);
}

/** Parses a Stellar decimal amount (seven places) into integer units. */
export function parseStellarAmount(value: string): bigint {
  if (!/^\d{1,20}(?:\.\d{1,7})?$/.test(value.trim())) {
    throw new StablecoinFlowError("malformed_response", `"${value}" is not a usable Stellar amount.`);
  }
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

function event(
  deployment: Deployment,
  asset: StablecoinAsset,
  direction: FlowDirection,
  units: bigint,
  at: string,
  txId: string,
  source: string,
): FlowEvent {
  if (units <= 0n) {
    throw new StablecoinFlowError("malformed_response", "A mint or burn of zero or less is not a flow event.");
  }
  return {
    chain: deployment.chain,
    direction,
    amountUnits: units.toString(),
    amount: decimalFromUnits(units, asset.canonicalDecimals),
    at,
    day: dayOf(at),
    txId,
    txUrl: `${deployment.explorerTxUrl}${txId}`,
    source,
  };
}

export function normalizeEvmEvent(raw: RawEvmFlowEvent, deployment: EvmDeployment, asset: StablecoinAsset): FlowEvent {
  if (!Number.isFinite(raw.blockTimestamp) || raw.blockTimestamp <= 0) {
    throw new StablecoinFlowError("malformed_response", `Block ${raw.blockNumber} reported no usable timestamp.`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw.txHash)) {
    throw new StablecoinFlowError("malformed_response", `"${raw.txHash}" is not a usable transaction hash.`);
  }
  const units = scaleUnits(parseIntegerAmount(raw.amount), deployment.decimals, asset.canonicalDecimals);
  return event(
    deployment,
    asset,
    raw.direction,
    units,
    new Date(raw.blockTimestamp * 1000).toISOString(),
    raw.txHash,
    `${deployment.chain} eth_getLogs on ${deployment.address}`,
  );
}

/**
 * Classifies a Horizon payment: value leaving the issuing account is issuance
 * of that asset, value returning to it is redemption. Anything else — another
 * asset, a payment between two third parties — is not a flow event for this
 * issuer and is dropped rather than counted.
 */
export function normalizeStellarPayment(
  raw: RawStellarPayment,
  deployment: StellarDeployment,
  asset: StablecoinAsset,
): FlowEvent | null {
  if (raw.type !== "payment") return null;
  if (raw.asset_code !== deployment.assetCode || raw.asset_issuer !== deployment.issuer) return null;
  const direction: FlowDirection | null =
    raw.from === deployment.issuer ? "mint" : raw.to === deployment.issuer ? "burn" : null;
  if (!direction) return null;
  if (!raw.created_at || !raw.amount) {
    throw new StablecoinFlowError("malformed_response", `Horizon payment ${raw.id} is missing its amount or time.`);
  }
  const txId = raw.transaction_hash ?? raw.id;
  const units = scaleUnits(parseStellarAmount(raw.amount), deployment.decimals, asset.canonicalDecimals);
  return event(
    deployment,
    asset,
    direction,
    units,
    new Date(raw.created_at).toISOString(),
    txId,
    `Horizon payments for ${deployment.assetCode}:${deployment.issuer}`,
  );
}

/** Stable ordering: newest first, then chain and transaction, so a report never depends on provider order. */
export function sortEvents(events: FlowEvent[]): FlowEvent[] {
  return [...events].sort(
    (left, right) =>
      right.at.localeCompare(left.at) || left.chain.localeCompare(right.chain) || left.txId.localeCompare(right.txId),
  );
}
