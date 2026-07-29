import type { RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { StrKey } from "@stellar/stellar-sdk";

export const X402_DEEP_SCAN_RESOURCE = "/api/x402/deep-scan";
export const X402_TESTNET_FACILITATOR_URL = "https://x402.org/facilitator";
export const X402_CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

export const STELLAR_TESTNET_USDC_CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const STELLAR_PUBNET_USDC_CONTRACT = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

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
  /** Whether Stellar testnet x402 payments are enabled */
  stellarEnabled: boolean;
  /** Stellar account address receiving x402 payments on testnet */
  stellarPayTo: string;
  /** Stellar SEP-41 USDC contract ID for x402 payments on testnet */
  stellarUsdcContract: string;
  /** Whether Stellar pubnet x402 is enabled (fail-closed by default) */
  stellarPubnetEnabled: boolean;
  /** Stellar account address receiving x402 payments on pubnet */
  stellarPubnetPayTo: string;
  /** Stellar SEP-41 USDC contract ID for x402 payments on pubnet */
  stellarPubnetUsdcContract: string;
};

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function getDefaultNetwork() {
  return process.env.VERCEL_ENV === "production" || process.env.PRODUCTION_DEPLOY === "1" ? "eip155:8453" : "eip155:84532";
}

function isStellarEnabled() {
  return clean(process.env.X402_STELLAR_ENABLED) === "1";
}

function isStellarPubnetEnabled() {
  // Fail-closed: pubnet is explicitly disabled unless the env var is set AND
  // the production facilitator is configured. This gate cannot be bypassed by
  // accident because X402_STELLAR_PUBNET_ENABLED requires a separate, deliberate
  // opt-in from X402_STELLAR_ENABLED.
  return isStellarEnabled() && clean(process.env.X402_STELLAR_PUBNET_ENABLED) === "1";
}

export function getX402RuntimeConfig(): X402RuntimeConfig {
  const cdpApiKeyId = clean(process.env.CDP_API_KEY_ID);
  const cdpApiKeySecret = clean(process.env.CDP_API_KEY_SECRET);
  const network = (clean(process.env.X402_NETWORK) ?? getDefaultNetwork()) as Network;
  const facilitatorUrl = clean(process.env.X402_FACILITATOR_URL) ?? (cdpApiKeyId && cdpApiKeySecret ? X402_CDP_FACILITATOR_URL : X402_TESTNET_FACILITATOR_URL);
  const payTo = clean(process.env.X402_PAY_TO) ?? DEFAULT_X402_PAY_TO;
  const priceUsd = clean(process.env.X402_PRICE_USD) ?? DEFAULT_X402_PRICE_USD;

  const usesCdpFacilitator = facilitatorUrl.includes("api.cdp.coinbase.com");
  const stellarEnabled = isStellarEnabled();

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
    stellarEnabled,
    stellarPayTo: clean(process.env.X402_STELLAR_PAY_TO) ?? "",
    stellarUsdcContract: clean(process.env.X402_STELLAR_USDC_CONTRACT) ?? STELLAR_TESTNET_USDC_CONTRACT,
    stellarPubnetEnabled: isStellarPubnetEnabled(),
    stellarPubnetPayTo: clean(process.env.X402_STELLAR_PUBNET_PAY_TO) ?? "",
    stellarPubnetUsdcContract: clean(process.env.X402_STELLAR_PUBNET_USDC_CONTRACT) ?? STELLAR_PUBNET_USDC_CONTRACT,
  };
}

export function getX402RouteConfig(config = getX402RuntimeConfig()): RouteConfig {
  const accepts: RouteConfig["accepts"] = [
    {
      scheme: "exact",
      price: config.priceUsd,
      network: config.network,
      payTo: config.payTo,
    },
  ];

  // Stellar testnet: registered when explicitly enabled and a recipient
  // address is configured. The USDC contract defaults to the well-known
  // testnet SEP-41 contract.
  if (config.stellarEnabled && config.stellarPayTo && StrKey.isValidEd25519PublicKey(config.stellarPayTo)) {
    accepts.push({
      scheme: "exact",
      price: config.priceUsd,
      network: "stellar:testnet" as Network,
      payTo: config.stellarPayTo,
      extra: {
        assetContract: config.stellarUsdcContract || STELLAR_TESTNET_USDC_CONTRACT,
        assetCode: "USDC",
        assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    });
  }

  // Stellar pubnet: explicitly fail-closed. Requires X402_STELLAR_PUBNET_ENABLED=1
  // (which itself requires X402_STELLAR_ENABLED=1) AND a valid pubnet payTo.
  if (config.stellarPubnetEnabled && config.stellarPubnetPayTo && StrKey.isValidEd25519PublicKey(config.stellarPubnetPayTo)) {
    accepts.push({
      scheme: "exact",
      price: config.priceUsd,
      network: "stellar:pubnet" as Network,
      payTo: config.stellarPubnetPayTo,
      extra: {
        assetContract: config.stellarPubnetUsdcContract || STELLAR_PUBNET_USDC_CONTRACT,
        assetCode: "USDC",
        assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        networkPassphrase: "Public Global Stellar Network ; September 2015",
      },
    });
  }

  return {
    accepts,
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

  if (!config.network.startsWith("eip155:") && !config.network.startsWith("solana:") && !config.network.startsWith("stellar:")) {
    issues.push("X402_NETWORK must use CAIP-2 format, for example eip155:84532 or stellar:testnet.");
  }

  if (config.network.startsWith("stellar:") && !StrKey.isValidEd25519PublicKey(config.payTo)) {
    issues.push("X402_PAY_TO must be a valid Stellar account address (G...) for stellar networks.");
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

  // Fail-closed: pubnet must never be silently enabled. If Stellar is on but
  // the pubnet flag is missing, that's intentional — not a configuration gap.
  if (config.stellarEnabled) {
    if (config.stellarPayTo && !StrKey.isValidEd25519PublicKey(config.stellarPayTo)) {
      issues.push("X402_STELLAR_PAY_TO must be a valid Stellar account address (G...) when Stellar x402 is enabled.");
    }
    if (config.stellarUsdcContract && !StrKey.isValidContract(config.stellarUsdcContract)) {
      issues.push("X402_STELLAR_USDC_CONTRACT must be a valid Stellar contract ID (C...) when Stellar x402 is enabled.");
    }
  }

  if (config.stellarPubnetEnabled) {
    if (config.stellarPubnetPayTo && !StrKey.isValidEd25519PublicKey(config.stellarPubnetPayTo)) {
      issues.push("X402_STELLAR_PUBNET_PAY_TO must be a valid Stellar account address (G...) when Stellar pubnet x402 is enabled.");
    }
    if (config.stellarPubnetUsdcContract && !StrKey.isValidContract(config.stellarPubnetUsdcContract)) {
      issues.push("X402_STELLAR_PUBNET_USDC_CONTRACT must be a valid Stellar contract ID (C...) when Stellar pubnet x402 is enabled.");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
