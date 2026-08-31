import "server-only";

import { StrKey } from "@stellar/stellar-sdk";

/**
 * The governance-approved pubnet configuration.
 *
 * These are the values a release review signed off on. Nothing here is a
 * default: a missing value means the condition cannot be verified, and an
 * unverifiable condition blocks pubnet rather than being assumed correct.
 *
 * Kept separate from `@/lib/stellar/config`, which describes what the app is
 * *configured* to use. The gate's job is to compare the two.
 */

export interface ApprovedPubnetConfig {
  /** SHA-256 hex of the reviewed risk-registry contract WASM. */
  registryWasmHash?: string;
  /** Contract ID the registry must resolve to. */
  registryContractId?: string;
  /** Contract ID of the governance policy contract. */
  policyContractId?: string;
  /** The `G…` account x402 payments must settle to on pubnet. */
  x402PayTo?: string;
  /** The SEP-41 USDC contract accepted on pubnet. */
  x402UsdcContract?: string;
  /** The facilitator origin approved for pubnet settlement. */
  x402FacilitatorOrigin?: string;
  /** Maximum ledger difference tolerated between independent RPC providers. */
  rpcLedgerTolerance: number;
}

const DEFAULT_RPC_LEDGER_TOLERANCE = 5;

function clean(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseTolerance(value?: string) {
  const parsed = Number(clean(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_RPC_LEDGER_TOLERANCE;
}

export function getApprovedPubnetConfig(): ApprovedPubnetConfig {
  return {
    registryWasmHash: clean(process.env.STELLAR_PUBNET_APPROVED_REGISTRY_WASM_HASH)?.toLowerCase(),
    registryContractId: clean(process.env.STELLAR_PUBNET_APPROVED_REGISTRY_ID),
    policyContractId: clean(process.env.STELLAR_PUBNET_APPROVED_POLICY_ID),
    x402PayTo: clean(process.env.STELLAR_PUBNET_APPROVED_X402_PAY_TO),
    x402UsdcContract: clean(process.env.STELLAR_PUBNET_APPROVED_USDC_CONTRACT),
    x402FacilitatorOrigin: clean(process.env.STELLAR_PUBNET_APPROVED_FACILITATOR_ORIGIN),
    rpcLedgerTolerance: parseTolerance(process.env.STELLAR_PUBNET_RPC_LEDGER_TOLERANCE),
  };
}

/** Whether the deployment is asking for pubnet at all. */
export function isPubnetRequested(): boolean {
  const configured = clean(process.env.NEXT_PUBLIC_STELLAR_NETWORK)?.toLowerCase();
  return configured === "stellar-pubnet" || configured === "stellar:pubnet" || configured === "pubnet";
}

/** A 64-character hex string, the shape of a SHA-256 WASM hash. */
export function isWasmHash(value?: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value ?? "");
}

export function isContractId(value?: string): boolean {
  return Boolean(value) && StrKey.isValidContract(value as string);
}

export function isStellarAccount(value?: string): boolean {
  return Boolean(value) && StrKey.isValidEd25519PublicKey(value as string);
}

/**
 * The origin of a URL, or undefined when it is not a usable HTTPS URL.
 * Comparing origins rather than whole URLs keeps a path change from silently
 * pointing settlement at a different service.
 */
export function httpsOrigin(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Names the approved values that are absent, for a single actionable message. */
export function missingApprovedValues(config: ApprovedPubnetConfig): string[] {
  const missing: string[] = [];

  if (!config.registryWasmHash) missing.push("STELLAR_PUBNET_APPROVED_REGISTRY_WASM_HASH");
  if (!config.registryContractId) missing.push("STELLAR_PUBNET_APPROVED_REGISTRY_ID");
  if (!config.policyContractId) missing.push("STELLAR_PUBNET_APPROVED_POLICY_ID");
  if (!config.x402PayTo) missing.push("STELLAR_PUBNET_APPROVED_X402_PAY_TO");
  if (!config.x402UsdcContract) missing.push("STELLAR_PUBNET_APPROVED_USDC_CONTRACT");
  if (!config.x402FacilitatorOrigin) missing.push("STELLAR_PUBNET_APPROVED_FACILITATOR_ORIGIN");

  return missing;
}
