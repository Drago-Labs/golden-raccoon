import type { RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";

export const X402_DEEP_SCAN_RESOURCE = "/api/x402/deep-scan";
export const X402_TESTNET_FACILITATOR_URL = "https://x402.org/facilitator";
export const X402_CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

const fallbackPayTo = "0x000000000000000000000000000000000000dEaD";
export const DEFAULT_X402_PAY_TO = "0x3ED3E93047b4bCF2e6Ab0744Db08a132d0c97D7d";
export const DEFAULT_X402_PRICE_USD = "$0.99";

export type X402RuntimeConfig = {
  protectedResource: string;
  payTo: string;
  priceUsd: string;
  network: Network;
  asset: string;
  facilitatorUrl: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  productionReady: boolean;
};

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function getDefaultNetwork() {
  return process.env.VERCEL_ENV === "production" || process.env.PRODUCTION_DEPLOY === "1" ? "eip155:8453" : "eip155:84532";
}

export function getX402RuntimeConfig(): X402RuntimeConfig {
  const cdpApiKeyId = clean(process.env.CDP_API_KEY_ID);
  const cdpApiKeySecret = clean(process.env.CDP_API_KEY_SECRET);
  const network = (clean(process.env.X402_NETWORK) ?? getDefaultNetwork()) as Network;
  const facilitatorUrl = clean(process.env.X402_FACILITATOR_URL) ?? (cdpApiKeyId && cdpApiKeySecret ? X402_CDP_FACILITATOR_URL : X402_TESTNET_FACILITATOR_URL);
  const payTo = clean(process.env.X402_PAY_TO) ?? DEFAULT_X402_PAY_TO;
  const priceUsd = clean(process.env.X402_PRICE_USD) ?? DEFAULT_X402_PRICE_USD;

  const usesCdpFacilitator = facilitatorUrl.includes("api.cdp.coinbase.com");

  return {
    protectedResource: X402_DEEP_SCAN_RESOURCE,
    payTo,
    priceUsd,
    network,
    asset: clean(process.env.X402_ASSET) ?? "USDC",
    facilitatorUrl,
    cdpApiKeyId,
    cdpApiKeySecret,
    productionReady: Boolean(
      payTo !== fallbackPayTo &&
        clean(process.env.X402_PAY_TO) &&
        clean(process.env.X402_PRICE_USD) &&
        clean(process.env.X402_NETWORK) &&
        clean(process.env.X402_FACILITATOR_URL) &&
        (!usesCdpFacilitator || (cdpApiKeyId && cdpApiKeySecret)),
    ),
  };
}

export function getX402RouteConfig(config = getX402RuntimeConfig()): RouteConfig {
  return {
    accepts: [
      {
        scheme: "exact",
        price: config.priceUsd,
        network: config.network,
        payTo: config.payTo,
      },
    ],
    description: "Golden Raccoon premium deep scan for AI Risk Report",
    mimeType: "application/json",
  };
}

export function validateX402RuntimeConfig(config = getX402RuntimeConfig()) {
  const issues: string[] = [];

  if (!/^\$[0-9]+(\.[0-9]+)?$/.test(config.priceUsd)) {
    issues.push("X402_PRICE_USD must use dollar format, for example $0.01.");
  }

  if (config.network.startsWith("eip155:") && !/^0x[a-fA-F0-9]{40}$/.test(config.payTo)) {
    issues.push("X402_PAY_TO must be a valid EVM address for eip155 networks.");
  }

  if (!config.network.startsWith("eip155:") && !config.network.startsWith("solana:")) {
    issues.push("X402_NETWORK must use CAIP-2 format, for example eip155:84532.");
  }

  if (!config.facilitatorUrl.startsWith("https://")) {
    issues.push("X402_FACILITATOR_URL must use https.");
  }

  if (config.facilitatorUrl.includes("api.cdp.coinbase.com") && (!config.cdpApiKeyId || !config.cdpApiKeySecret)) {
    issues.push("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for the CDP x402 facilitator.");
  }

  if (config.network === "eip155:8453" && !config.facilitatorUrl.includes("api.cdp.coinbase.com")) {
    issues.push("Base mainnet x402 payments must use the authenticated CDP facilitator.");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
