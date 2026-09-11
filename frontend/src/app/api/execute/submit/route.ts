import { NextResponse } from "next/server";
import { jsonError } from "@/server/api/errors";
import { z } from "zod";
import { gateFeature } from "@/server/features/evaluator";
import { isWalletAddressForChain, isStellarAccountAddress, canonicalizeAddress, getChainFamily } from "@/lib/chainIdentity";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { submitTransaction } from "@/server/transactions/lifecycleManager";
import { evaluateCapability } from "@/server/security/authz";
import { withRouteSpan } from "@/server/observability/tracing/spans";

export const AUTHZ_CAPABILITY = "execution:submit" as const;
const bodySchema = z.object({
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().min(1).max(64),
  walletAddress: z.string().min(1),
  sourceAccount: z.string().optional(),
  signedPayload: z.string().min(10).max(200_000),
  decisionId: z.string().optional(),
  decisionAction: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]).optional(),
  asset: z.string().min(1).max(80),
  valueUsd: z.number().min(0).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  policyStatus: z.object({ allowed: z.boolean(), violations: z.array(z.string()) }).optional(),
  expectedEffects: z.array(z.object({
    kind: z.enum(["transfer", "swap", "approval", "contract_call", "publish_risk"]),
    fromToken: z.string().optional(),
    toToken: z.string().optional(),
    fromAddress: z.string().optional(),
    toAddress: z.string().optional(),
    amount: z.string().optional(),
    contractAddress: z.string().optional(),
    method: z.string().optional(),
    assetKey: z.string().optional(),
  })).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  quoteHash: z.string().optional(),
  toAsset: z.string().optional(),
  inputAmount: z.string().optional(),
  quoteBinding: z.object({
    quoteHash: z.string(),
    signature: z.string(),
    expiresAt: z.number(),
    chain: z.string(),
    walletAddress: z.string(),
    fromAsset: z.string(),
    toAsset: z.string(),
    inputAmount: z.string(),
    minReceiveAmount: z.string(),
  }).optional(),
});

export async function POST(request: Request) {
  return withRouteSpan("execute.submit", { "http.method": "POST" }, async () => {
  const rateLimited = checkRateLimit(request, { namespace: "execute:submit", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError({ code: "validation_error", message: "Invalid input", status: 400, details: parsed.error.flatten() });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) {
    return session.response;
  }

  const authz = evaluateCapability(
    { kind: "wallet", walletAddress: session.wallet, walletHash: "route", chainFamily: parsed.data.chainFamily, network: parsed.data.network.toLowerCase() },
    AUTHZ_CAPABILITY,
    { walletAddress: parsed.data.walletAddress, chainFamily: parsed.data.chainFamily, network: parsed.data.network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403 });

  const submitGate = gateFeature("execute_submit", parsed.data.walletAddress ?? "");
  if (!submitGate.enabled) {
    return NextResponse.json(
      { error: "feature_disabled", feature: "execute_submit", detail: submitGate.detail },
      { status: 403 },
    );
  }

  const walletFamily = getChainFamily(parsed.data.network);
  if (parsed.data.chainFamily !== walletFamily) {
    return jsonError({ code: "chain_family_mismatch", message: `Network ${parsed.data.network} belongs to ${walletFamily} but family ${parsed.data.chainFamily} was supplied.`, status: 400 });
  }

  const walletValid = parsed.data.chainFamily === "stellar" ? isStellarAccountAddress(parsed.data.walletAddress) : isWalletAddressForChain(parsed.data.walletAddress, "evm");
  if (!walletValid) {
    return jsonError({ code: "invalid_wallet", message: `Wallet address does not match ${parsed.data.chainFamily} format.`, status: 400 });
  }

  if (parsed.data.sourceAccount && parsed.data.chainFamily === "stellar" && !isStellarAccountAddress(parsed.data.sourceAccount)) {
    return jsonError({ code: "invalid_source", message: "Stellar source account must be a valid G-address.", status: 400 });
  }

  if (parsed.data.sourceAccount && parsed.data.chainFamily === "evm" && canonicalizeAddress(parsed.data.sourceAccount, "evm") !== canonicalizeAddress(parsed.data.walletAddress, "evm")) {
    return jsonError({ code: "source_wallet_mismatch", message: "EVM source account must equal the connected wallet.", status: 403 });
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key") ??
    request.headers.get("x-idempotency-key") ??
    parsed.data.idempotencyKey;

  if (!idempotencyKey) {
    return jsonError({
      code: "idempotency_key_required",
      message: "Idempotency key is strictly required on /api/execute/submit via Idempotency-Key header or idempotencyKey body field.",
      status: 400,
    });
  }

  try {
    const report = await submitTransaction({
      chainFamily: parsed.data.chainFamily,
      network: parsed.data.network,
      walletAddress: parsed.data.walletAddress,
      sourceAccount: parsed.data.sourceAccount,
      decisionId: parsed.data.decisionId,
      decisionAction: parsed.data.decisionAction,
      asset: parsed.data.asset,
      valueUsd: parsed.data.valueUsd,
      simulationStatus: parsed.data.simulationStatus,
      policyStatus: parsed.data.policyStatus,
      expectedEffects: parsed.data.expectedEffects,
      userApproved: true,
      signedPayload: parsed.data.signedPayload,
      idempotencyKey,
      quoteBinding: parsed.data.quoteBinding,
      quoteHash: parsed.data.quoteHash ?? parsed.data.quoteBinding?.quoteHash,
      toAsset: parsed.data.toAsset,
      inputAmount: parsed.data.inputAmount,
    } as any);

    return withCacheHeaders(NextResponse.json({
      success: true,
      outcome: report.outcome,
      replayed: report.result.replayed ?? (report.outcome === "ignored_duplicate"),
      ...report.result,
      transaction: report.transaction,
    }), "execution");
  } catch (error) {
    const code = (error as { code?: string }).code ?? "submit_failed";
    const status = (error as { statusCode?: number }).statusCode
      ?? (code === "idempotency_payload_mismatch" ? 409
      : code === "approval_required" ? 403
      : code === "hash_chain_family_mismatch" || code === "network_chain_family_mismatch" || code === "quote_binding_mismatch" || code === "quote_expired" || code === "idempotency_key_required" ? 400
      : code === "transaction_not_found" ? 404
      : 502);
    return jsonError({
      code: code as any,
      message: error instanceof Error ? error.message : "Could not submit transaction.",
      status,
      legacy: (error && typeof error === "object" && "detail" in error ? { extra: (error as { detail?: unknown }).detail } : {}),
    });
  }
  });
}
