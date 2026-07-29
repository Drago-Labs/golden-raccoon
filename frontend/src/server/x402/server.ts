import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";
import { getRegisteredSchemes } from "@/server/x402/schemes";

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

  const server = new x402ResourceServer(facilitatorClient);
  const schemes = getRegisteredSchemes(config);

  for (const registered of schemes) {
    server.register(config.network as Network, registered.scheme);
  }

  return server;
}
