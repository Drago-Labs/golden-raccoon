import type { PaymentScheme } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { X402ChainFamily } from "@/server/types";
import type { X402RuntimeConfig } from "@/server/x402/config";

/**
 * A payment scheme that can be registered with the x402 resource server.
 * Each scheme is bound to a specific chain family and network.
 */
export type RegisteredScheme = {
  scheme: PaymentScheme;
  chainFamily: X402ChainFamily;
  label: string;
};

/**
 * Stellar x402 scheme placeholder.
 *
 * This is an extension point. When a Stellar x402 facilitator and
 * payment scheme implementation are available, register it here
 * without weakening the Base/Exact EVM path.
 *
 * Until then, Stellar payments are not accepted and the server
 * fails closed (402) when stellar network is configured without
 * an explicit facilitator.
 *
 * Known limitation: The placeholder uses ExactEvmScheme because
 * @x402/stellar is not yet available. When it ships, replace
 * this with `new ExactStellarScheme()` and the boundary is ready.
 */
function createStellarExactSchemePlaceholder(_config: X402RuntimeConfig): RegisteredScheme {
  return {
    // Replace with a real StellarExactScheme when available.
    scheme: new ExactEvmScheme(),
    chainFamily: "stellar",
    label: "exact-stellar",
  };
}

/**
 * Returns the ordered list of registered payment schemes for the
 * given x402 runtime configuration.
 *
 * EVM (Base) is always registered first. Stellar is only registered
 * when explicitly enabled via X402_STELLAR_ENABLED=1 and the network
 * is a Stellar CAIP-2 network.
 */
export function getRegisteredSchemes(config: X402RuntimeConfig): RegisteredScheme[] {
  const schemes: RegisteredScheme[] = [
    {
      scheme: new ExactEvmScheme(),
      chainFamily: "evm",
      label: "exact",
    },
  ];

  if (config.supportedSchemes.includes("exact-stellar")) {
    schemes.push(createStellarExactSchemePlaceholder(config));
  }

  return schemes;
}
