import "server-only";

import { getX402RuntimeConfig } from "@/server/x402/config";
import {
  getApprovedPubnetConfig,
  httpsOrigin,
  isContractId,
  isStellarAccount,
  type ApprovedPubnetConfig,
} from "@/server/stellar/config";
import { fail, pass, type PubnetCheckResult } from "@/server/stellar/checks/types";

const ID = "payment_config" as const;
const TITLE = "x402 pubnet payment configuration";

/**
 * Verifies that pubnet payments settle where the review said they would.
 *
 * A testnet-shaped payment address is the failure this exists to catch: it is
 * syntactically fine, it passes every static check, and on mainnet it sends
 * real USDC to an account nobody controls.
 */
export function checkPaymentConfig(
  approved: ApprovedPubnetConfig = getApprovedPubnetConfig(),
  runtime = getX402RuntimeConfig(),
): PubnetCheckResult {
  if (!approved.x402PayTo || !approved.x402UsdcContract || !approved.x402FacilitatorOrigin) {
    return fail(
      ID,
      TITLE,
      "approved_config_missing",
      "The approved pubnet payment address, USDC contract or facilitator origin is not " +
        "configured, so live settlement cannot be compared against the review.",
    );
  }

  if (runtime.network !== "stellar:pubnet") {
    return fail(
      ID,
      TITLE,
      "payment_network_mismatch",
      `x402 is configured for "${runtime.network}" while the deployment is asking for pubnet. ` +
        "Payments would settle on a different network from the one being advertised.",
      { configuredNetwork: runtime.network },
    );
  }

  if (!isStellarAccount(runtime.payTo)) {
    return fail(
      ID,
      TITLE,
      "payment_address_invalid",
      "The configured x402 payment address is not a valid Stellar account address.",
    );
  }

  if (runtime.payTo !== approved.x402PayTo) {
    return fail(
      ID,
      TITLE,
      "payment_address_unapproved",
      "The configured x402 payment address is not the governance-approved pubnet account. " +
        "Real USDC would settle to an unreviewed destination.",
      { configuredPayTo: `${runtime.payTo.slice(0, 8)}…${runtime.payTo.slice(-6)}` },
    );
  }

  const configuredUsdc = runtime.stellarPubnetUsdcContract;

  if (!isContractId(configuredUsdc) || configuredUsdc !== approved.x402UsdcContract) {
    return fail(
      ID,
      TITLE,
      "usdc_contract_unapproved",
      "The configured pubnet USDC contract is not the approved SEP-41 contract. " +
        "Payments could be denominated in an asset that only looks like USDC.",
    );
  }

  const facilitatorOrigin = httpsOrigin(runtime.facilitatorUrl);

  if (!facilitatorOrigin || facilitatorOrigin !== approved.x402FacilitatorOrigin) {
    return fail(
      ID,
      TITLE,
      "facilitator_unapproved",
      "The x402 facilitator is not the approved HTTPS origin for pubnet settlement.",
      { configuredFacilitator: facilitatorOrigin ?? "not a usable HTTPS origin" },
    );
  }

  return pass(
    ID,
    TITLE,
    "Pubnet payments settle to the approved account, in the approved USDC contract, " +
      "through the approved facilitator.",
    { facilitatorOrigin },
  );
}
