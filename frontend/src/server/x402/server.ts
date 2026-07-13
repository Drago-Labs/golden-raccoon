import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";

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

  return new x402ResourceServer(facilitatorClient).register(config.network as Network, new ExactEvmScheme());
}
