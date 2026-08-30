import "server-only";

/**
 * The pubnet readiness gate (issue #149).
 *
 * Mainnet moves real user funds, so pubnet is not reachable through
 * configuration alone. Every condition below is an individually evaluable
 * check, and the gate fails closed: unless *all* of them pass, pubnet is not
 * advertised and pubnet actions are refused with a typed reason.
 */

export type PubnetCheckId =
  | "contract_identity"
  | "payment_config"
  | "rpc_independence"
  | "governance_addresses";

export type PubnetCheckStatus = "pass" | "fail" | "error";

/**
 * Why a check failed.
 *
 * These are the reasons callers may branch on and surface to an operator.
 * "unavailable" is deliberately a failure, not a pass: an unverifiable
 * condition is not a satisfied one.
 */
export type PubnetFailureReason =
  | "network_passphrase_mismatch"
  | "registry_contract_missing"
  | "registry_contract_invalid"
  | "wasm_hash_mismatch"
  | "wasm_hash_unverified"
  | "payment_address_invalid"
  | "payment_address_unapproved"
  | "payment_network_mismatch"
  | "usdc_contract_unapproved"
  | "facilitator_unapproved"
  | "rpc_providers_insufficient"
  | "rpc_providers_dependent"
  | "rpc_provider_unreachable"
  | "rpc_ledger_disagreement"
  | "policy_contract_unapproved"
  | "registry_contract_unapproved"
  | "approved_config_missing"
  | "check_errored";

export interface PubnetCheckResult {
  id: PubnetCheckId;
  title: string;
  status: PubnetCheckStatus;
  /** Present whenever the status is not "pass". */
  reason?: PubnetFailureReason;
  /** One operator-facing sentence naming the concrete thing that is wrong. */
  detail: string;
  /** Non-secret observations, safe for the health response and the ops page. */
  observed?: Record<string, string | number | boolean | null>;
}

export function pass(
  id: PubnetCheckId,
  title: string,
  detail: string,
  observed?: PubnetCheckResult["observed"],
): PubnetCheckResult {
  return { id, title, status: "pass", detail, observed };
}

export function fail(
  id: PubnetCheckId,
  title: string,
  reason: PubnetFailureReason,
  detail: string,
  observed?: PubnetCheckResult["observed"],
): PubnetCheckResult {
  return { id, title, status: "fail", reason, detail, observed };
}

/**
 * A check that could not complete.
 *
 * Kept distinct from `fail` so an operator can tell "this condition is not
 * satisfied" from "we could not find out" — but both block pubnet.
 */
export function errored(
  id: PubnetCheckId,
  title: string,
  detail: string,
): PubnetCheckResult {
  return { id, title, status: "error", reason: "check_errored", detail };
}
