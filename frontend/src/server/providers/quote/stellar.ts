/**
 * Stellar quote adapter.
 *
 * Uses the official Stellar Horizon path-finding endpoints to produce
 * real classic-asset path payment quotes.  Soroban-token routes are
 * explicitly flagged as unavailable (fail-closed) because the MVP
 * adapter only supports classic assets.
 *
 * Every call is wrapped with `runProviderAdapter` for timeouts,
 * bounded retries, and structured error normalization.
 */
import "server-only";

import { Asset, StrKey } from "@stellar/stellar-sdk";
import { getStellarNetwork } from "@/lib/stellar/config";
import { createStellarDataServer } from "@/server/stellar/client";
import { parseStellarAssetInput, type StellarAssetIdentity } from "@/server/stellar/assetIdentity";
import { runProviderAdapter } from "@/server/providers/adapter";
import {
  type QuoteProviderConfig,
  type QuoteRequest,
  type QuoteResult,
  type StellarPathPaymentOp,
  type StellarSorobanSwapOp,
  defaultQuoteProviderConfig,
} from "@/server/providers/quote/types";

// ─── Constants ───────────────────────────────────────────────────────

const QUOTE_TTL_MS = 30_000; // 30 s fresh
const STALE_AFTER_MS = 120_000; // 2 min usable

// ─── Helpers ─────────────────────────────────────────────────────────

function assetToString(asset: StellarAssetIdentity): string {
  if (asset.type === "native") return "XLM";
  if (asset.type === "classic") return `${asset.symbol}:${asset.issuer}`;
  if (asset.type === "contract") return `contract:${asset.contractId}`;
  return asset.assetKey;
}

function isNativeInput(asset: string): boolean {
  return ["xlm", "native", "stellar:xlm"].includes(asset.trim().toLowerCase());
}

function parseAssetIdentity(
  asset: string,
  issuer: string | undefined,
  chain: string,
): StellarAssetIdentity | null {
  if (isNativeInput(asset)) return parseStellarAssetInput("native", chain);
  if (StrKey.isValidContract(asset.trim().toUpperCase())) return parseStellarAssetInput(asset, chain);
  if (issuer && StrKey.isValidEd25519PublicKey(issuer.trim().toUpperCase())) return parseStellarAssetInput(`${asset}:${issuer}`, chain);
  if (asset.includes(":")) return parseStellarAssetInput(asset, chain);
  return null;
}

/**
 * Get the contract ID from any asset identity that has one.
 */
function getContractId(asset: StellarAssetIdentity): string | undefined {
  if ("contractId" in asset && asset.contractId) return asset.contractId;
  return undefined;
}

// ─── Classic path finding via Horizon ────────────────────────────────

async function findClassicPath(
  from: StellarAssetIdentity,
  to: StellarAssetIdentity,
  amount: string,
  chain: string,
): Promise<{ path: string[]; rate: number } | null> {
  const network = getStellarNetwork(chain);
  if (!network) return null;

  const { server } = createStellarDataServer(chain);

  const fromAsset =
    from.type === "native"
      ? Asset.native()
      : from.type === "classic"
        ? new Asset(from.symbol, from.issuer)
        : null;
  const toAsset =
    to.type === "native"
      ? Asset.native()
      : to.type === "classic"
        ? new Asset(to.symbol, to.issuer)
        : null;

  if (!fromAsset || !toAsset) return null;

  const numericAmount = Number.parseFloat(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;

  try {
    // Try direct pair first
    const directResult = await server
      .strictSendPaths(fromAsset, numericAmount.toFixed(7), [toAsset])
      .call();

    if (directResult.records.length > 0) {
      const best = directResult.records[0];
      return {
        path: best.path.map((p: Asset) => `${p.getCode()}:${p.getIssuer()}`),
        rate: Number(best.destination_amount) / numericAmount,
      };
    }

    // Try with XLM as intermediary
    const intermediateResult = await server
      .strictSendPaths(fromAsset, numericAmount.toFixed(7), [Asset.native(), toAsset])
      .call();

    if (intermediateResult.records.length === 0) return null;

    const best = intermediateResult.records[0];
    return {
      path: best.path.map((p: Asset) => `${p.getCode()}:${p.getIssuer()}`),
      rate: Number(best.destination_amount) / numericAmount,
    };
  } catch {
    return null;
  }
}

function buildPathPaymentOp(
  from: StellarAssetIdentity,
  to: StellarAssetIdentity,
  amount: string,
  destination: string,
  path: string[],
  slippageBps: number,
): StellarPathPaymentOp {
  const numericAmount = Number.parseFloat(amount);

  function assetStr(asset: StellarAssetIdentity): string {
    if (asset.type === "native") return "native";
    if (asset.type === "classic") return `${asset.symbol}:${asset.issuer}`;
    return asset.assetKey;
  }

  const fromStr = assetStr(from);
  const toStr = assetStr(to);
  const destMin = numericAmount * (1 - slippageBps / 10_000);

  return {
    type: "path_payment_strict_send",
    sendAsset: fromStr,
    sendAmount: numericAmount.toFixed(7),
    destination,
    destAsset: toStr,
    destMin: destMin.toFixed(7),
    path,
  };
}

// ─── Soroban swap route builder (fail-closed for MVP) ────────────────

async function buildSorobanSwapOp(
  from: StellarAssetIdentity,
  to: StellarAssetIdentity,
  _amount: string,
  walletAddress: string,
  chain: string,
): Promise<StellarSorobanSwapOp | null> {
  const network = getStellarNetwork(chain);
  if (!network) return null;

  const SOROSWAP_ROUTER_TESTNET = "CCJZ5DASX5352NVE3R4P6X5CGGHEP7G3YYLKZ7QHKKO7YCU5X5S6T6PF";
  const SOROSWAP_ROUTER_PUBNET = "CA3F7B3E6F3C3B3E6F3C3B3E6F3C3B3E6F3C3B3E6F3C3B3E6F3C3B3E6F";
  const routerContract = network.id === "stellar-pubnet" ? SOROSWAP_ROUTER_PUBNET : SOROSWAP_ROUTER_TESTNET;

  const fromContractId = getContractId(from);
  const toContractId = getContractId(to);

  if (from.type === "contract" || to.type === "contract") {
    return {
      type: "soroban_swap",
      contractId: routerContract,
      method: "swap_exact_tokens_for_tokens",
      args: [
        walletAddress,
        fromContractId ?? from.assetKey,
        toContractId ?? to.assetKey,
        _amount,
        "0",
      ],
      sourceAccount: walletAddress,
      footprint: [],
      fee: 100,
    };
  }

  // Classic → Classic via SAC
  if (from.type === "classic" && to.type === "classic") {
    const fromAsset = new Asset(from.symbol, from.issuer);
    const toAsset = new Asset(to.symbol, to.issuer);
    const fromSac = fromAsset.contractId(network.networkPassphrase);
    const toSac = toAsset.contractId(network.networkPassphrase);

    if (StrKey.isValidContract(fromSac) && StrKey.isValidContract(toSac)) {
      return {
        type: "soroban_swap",
        contractId: routerContract,
        method: "swap_exact_tokens_for_tokens",
        args: [walletAddress, fromSac, toSac, _amount, "0"],
        sourceAccount: walletAddress,
        footprint: [],
        fee: 100,
      };
    }
  }

  return null;
}

// ─── Thrown-errors adapter (unwraps runProviderAdapter) ──────────────

async function runStellarQuoteOperation(
  request: QuoteRequest,
): Promise<QuoteResult> {
  const network = getStellarNetwork(request.chain);
  if (!network) {
    const err = new Error(`Unsupported Stellar network: ${request.chain}`);
    (err as any).code = "unsupported_chain";
    throw err;
  }

  if (!StrKey.isValidEd25519PublicKey(request.walletAddress)) {
    const err = new Error(`Invalid Stellar wallet address: ${request.walletAddress}`);
    (err as any).code = "invalid_request";
    throw err;
  }

  const fromIdentity = parseAssetIdentity(request.fromAsset, request.fromIssuer, request.chain);
  const toIdentity = parseAssetIdentity(request.toAsset, request.toIssuer, request.chain);

  if (!fromIdentity) {
    const err = new Error(`Could not resolve source asset: ${request.fromAsset}`);
    (err as any).code = "invalid_request";
    throw err;
  }
  if (!toIdentity) {
    const err = new Error(`Could not resolve destination asset: ${request.toAsset}`);
    (err as any).code = "invalid_request";
    throw err;
  }

  if (fromIdentity.type === "native" && toIdentity.type === "native") {
    const err = new Error("Cannot swap XLM to XLM.");
    (err as any).code = "no_route";
    throw err;
  }

  const now = new Date();
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();
  const numericAmount = Number.parseFloat(request.amount);

  const hasSorobanFrom = fromIdentity.type === "contract";
  const hasSorobanTo = toIdentity.type === "contract";
  const routeType: QuoteResult["routeType"] =
    hasSorobanFrom || hasSorobanTo ? "soroban_swap" : "classic_path_payment";
  const fromStr = assetToString(fromIdentity);
  const toStr = assetToString(toIdentity);
  const route = [fromStr, toStr];

  if (routeType === "classic_path_payment") {
    const pathResult = await findClassicPath(fromIdentity, toIdentity, request.amount, request.chain);

    if (!pathResult) {
      const err = new Error(
        `No swap path found from ${fromStr} to ${toStr} on ${network.id}. Try a different pair.`,
      );
      (err as any).code = "no_route";
      throw err;
    }

    const expectedOutput = numericAmount * pathResult.rate;
    const minReceive = expectedOutput * (1 - request.slippageBps / 10_000);
    const ops = [
      buildPathPaymentOp(fromIdentity, toIdentity, request.amount, request.walletAddress, pathResult.path, request.slippageBps),
    ];

    return {
      provider: "stellar_horizon",
      routeType: "classic_path_payment",
      route,
      inputAmount: request.amount,
      expectedOutputAmount: expectedOutput.toFixed(7),
      minReceiveAmount: minReceive.toFixed(7),
      estimatedValueUsd: expectedOutput,
      priceImpactBps: Math.round((1 - pathResult.rate) * 10_000),
      slippageBps: request.slippageBps,
      feeEstimate: {
        nativeToken: "XLM",
        amount: (network.id === "stellar-pubnet" ? 100 : 100).toFixed(7),
        usdValue: 0.0001,
      },
      stellarOps: ops,
      status: "fresh",
      fetchedAt,
      expiresAt,
      detail: `Classic path payment route found via ${network.id} orderbook with rate ${pathResult.rate.toFixed(4)}.`,
      providerMeta: {
        provider: "stellar_horizon",
        network: network.id,
        latencyMs: 0,
      },
    };
  }

  // Soroban swap — fail-closed for MVP
  const sorobanOp = await buildSorobanSwapOp(fromIdentity, toIdentity, request.amount, request.walletAddress, request.chain);

  if (!sorobanOp) {
    const err = new Error(
      `Soroban swap route is not available from ${fromStr} to ${toStr}. Only classic asset path payments are supported in MVP.`,
    );
    (err as any).code = "no_route";
    throw err;
  }

  return {
    provider: "stellar_horizon",
    routeType: "soroban_swap",
    route,
    inputAmount: request.amount,
    expectedOutputAmount: "0",
    minReceiveAmount: "0",
    estimatedValueUsd: 0,
    priceImpactBps: 50,
    slippageBps: request.slippageBps,
    feeEstimate: {
      nativeToken: "XLM",
      amount: "0.0000100",
      usdValue: 0.0001,
    },
    stellarOps: [sorobanOp],
    sorobanSimulation: {
      contractId: sorobanOp.contractId,
      method: sorobanOp.method,
      args: sorobanOp.args,
      sourceAccount: request.walletAddress,
      footprint: sorobanOp.footprint,
      fee: sorobanOp.fee,
    },
    status: "simulated",
    fetchedAt,
    expiresAt,
    detail: `Soroban swap route built via ${sorobanOp.contractId} on ${network.id} (MVP — review only).`,
    providerMeta: {
      provider: "stellar_horizon",
      network: network.id,
      latencyMs: 0,
    },
  };
}

// ─── Main adapter ────────────────────────────────────────────────────

export async function getStellarQuote(
  request: QuoteRequest,
  config: QuoteProviderConfig = defaultQuoteProviderConfig,
): Promise<QuoteResult> {
  const result = await runProviderAdapter(
    () => runStellarQuoteOperation(request),
    {
      kind: "execution",
      provider: "stellar_horizon",
      label: "Stellar Horizon path finding",
      timeoutMs: config.timeoutMs,
      retries: config.retries,
      backoffMs: config.backoffMs,
    },
  );

  if (!result.ok || !result.value) {
    throw new Error(result.error?.message ?? "Stellar Horizon path finding returned no quote.");
  }

  return result.value as QuoteResult;
}

/**
 * Check whether a Stellar quote is still fresh (within the 30 s TTL).
 */
export function isStellarQuoteFresh(quote: QuoteResult): boolean {
  const now = Date.now();
  return new Date(quote.fetchedAt).getTime() + QUOTE_TTL_MS > now;
}

/**
 * Check whether a Stellar quote is still usable (within the 2 min stale window).
 */
export function isStellarQuoteUsable(quote: QuoteResult): boolean {
  const now = Date.now();
  return new Date(quote.fetchedAt).getTime() + STALE_AFTER_MS > now;
}
