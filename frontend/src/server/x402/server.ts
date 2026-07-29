import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";
import { StrKey } from "@stellar/stellar-sdk";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";
import { StellarExactScheme } from "@/server/x402/stellarScheme";

export function createX402ResourceServer() {
  const config = getX402RuntimeConfig();
  const validation = validateX402RuntimeConfig(config);

  if (!validation.ok) {
    throw new Error(`Invalid x402 configuration: ${validation.issues.join(" ")}`);
  }

  const facilitatorClient = new HTTPFacilitatorClient(
    config.facilitatorUrl.includes("api.cdp.coinbase.com")
      ? createFacilitatorConfig(config.cdpApiKeyId, config.cdpApiKeySecret)
      : { url: config.facilitatorUrl },
  );

  const server = new x402ResourceServer(facilitatorClient).register(config.network as Network, new ExactEvmScheme());

  // Register Stellar testnet scheme when explicitly enabled and a valid
  // recipient (G...) is configured. The StellarExactScheme handles
  // price-to-atomic-unit conversion for SEP-41 USDC.
  if (config.stellarEnabled && config.stellarPayTo && StrKey.isValidEd25519PublicKey(config.stellarPayTo)) {
    server.register("stellar:testnet" as Network, new StellarExactScheme());
  }

  // Pubnet is fail-closed: only register when X402_STELLAR_PUBNET_ENABLED=1
  // AND a valid pubnet payTo is provided. This is a double opt-in that cannot
  // be triggered by accident.
  if (config.stellarPubnetEnabled && config.stellarPubnetPayTo && StrKey.isValidEd25519PublicKey(config.stellarPubnetPayTo)) {
    server.register("stellar:pubnet" as Network, new StellarExactScheme());
  }

  return server;
}
