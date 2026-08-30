import "server-only";

import { getX402RuntimeConfig } from "@/server/x402/config";
import {
  PubnetGatedError,
  evaluatePubnetReadiness,
  type PubnetReadiness,
} from "@/server/stellar/pubnetGate";

/**
 * The pubnet boundary for x402 payments (issue #149).
 *
 * Scheme registration is synchronous and the readiness gate is not, so the
 * decision is made here, at the request boundary, where awaiting is free. Every
 * pubnet payment path funnels through these two functions rather than reading
 * configuration directly, so there is one place that can say yes.
 */

/** True when the configured x402 network is Stellar pubnet. */
export function isStellarPubnetPayment(network = getX402RuntimeConfig().network): boolean {
  return network === "stellar:pubnet";
}

/**
 * Whether pubnet may be offered in a 402 `accepts` list.
 *
 * Testnet and EVM are unaffected: they never consult the gate.
 */
export async function isStellarPubnetPaymentAdvertised(): Promise<boolean> {
  if (!isStellarPubnetPayment()) return false;
  return (await evaluatePubnetReadiness()).ready;
}

/**
 * Refuses a pubnet payment while the gate is closed.
 *
 * Throws `PubnetGatedError`, which carries the specific reason, so a caller can
 * tell an operator which condition to fix instead of reporting a generic
 * payment failure.
 */
export async function assertStellarPubnetPaymentAllowed(): Promise<void> {
  if (!isStellarPubnetPayment()) return;

  const readiness: PubnetReadiness = await evaluatePubnetReadiness();
  if (!readiness.ready) throw new PubnetGatedError(readiness);
}

export { PubnetGatedError };
