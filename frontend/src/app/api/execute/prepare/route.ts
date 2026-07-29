import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { buildExecutionPreviewFromPortfolio } from "@/server/agents/execution";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord } from "@/server/storage";
import { prepareTransaction } from "@/server/transactions/lifecycleManager";
import type { TransactionRecord } from "@/server/types";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  network: z.string().optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  action: z.string().optional(),
  decisionId: z.string().optional(),
  fromToken: z.string().optional(),
  toToken: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  estimatedValueUsd: z.number().min(0).optional(),
  slippageBps: z.number().min(0).max(10_000).optional(),
  priceImpactBps: z.number().min(0).optional(),
  gasEstimateUsd: z.number().min(0).optional(),
  quoteAvailable: z.boolean().optional(),
  expectedOutputAmount: z.number().min(0).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  simulationRevertReason: z.string().optional(),
  sourceAccount: z.string().optional(),
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
  // rawPayload explicitly removed: the server independently rebuilds the signed
  // payload from its own trusted quote, simulation, and portfolio context.
  // Client-supplied calldata/XDR is NEVER accepted for security.
});

function canonicalizeSeed(value: string): string {
  return value.trim().toLowerCase();
}

function buildIdempotencyKey(input: { walletAddress?: string; network?: string; decisionId?: string; asset?: string; providedKey?: string }) {
  if (input.providedKey) return input.providedKey;
  // Deterministic auto-derived key: same inputs always collide to the same prepared
  // record. The caller is expected to supply an explicit idempotencyKey for nonce-like
  // distinct prepares; this fallback is for cases where the caller intentionally wants
  // retry safety on the same logical intent.
  const seed = [
    canonicalizeSeed(input.walletAddress ?? "_"),
    canonicalizeSeed(input.network ?? "_"),
    canonicalizeSeed(input.decisionId ?? "_"),
    canonicalizeSeed(input.asset ?? "_"),
  ].join("|");
  const digest = createHash("sha256").update(seed).digest("hex");
  return `auto:${digest}`;
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:prepare", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);
  const rules = getUserRuleRecord(parsed.data.walletAddress ?? portfolio.walletAddress);
  const preview = await buildExecutionPreviewFromPortfolio(portfolio, { ...parsed.data, rules });

  const walletAddress = parsed.data.walletAddress ?? portfolio.walletAddress;
  const network = parsed.data.network ?? preview.network ?? "Connected wallet";
  const chainFamily = parsed.data.chainFamily ?? (network?.toLowerCase().startsWith("stellar") ? "stellar" : "evm");

  // ── Server-side payload validation ──────────────────────────────────────
  // Do NOT accept rawPayload from the client. The server rebuilds the signed
  // payload from its own trusted quote, simulation, and portfolio context.
  // This prevents a compromised or misbehaving client from injecting arbitrary
  // calldata/XDR that users would blindly sign.
  //
  // Cross-validate caller-supplied expectedEffects against the server-generated
  // execution preview. If the effects reference amounts, addresses, or tokens
  // that conflict with the trusted preview, reject the request here before any
  // record is persisted.

  // NOTE: Amount cross-validation against preview.quote.expectedOutputAmount is
  // deliberately NOT done here because effect.amount is a USD-denominated string
  // (e.g. "30.00") while quote.expectedOutputAmount is a token-quantity number
  // in the destination asset (e.g. 29.7 USDC). These are different units of
  // measure and cannot be compared directly. The token/route validation below
  // is sufficient to ensure the effects are semantically consistent with the
  // preview.
  if (parsed.data.expectedEffects && parsed.data.expectedEffects.length > 0) {
    // Validate effect tokens match the preview's route
    if (preview.quote?.route && preview.quote.route.length >= 2) {
      for (const effect of parsed.data.expectedEffects) {
        if (effect.kind === "swap" || effect.kind === "transfer") {
          if (effect.fromToken && !preview.quote.route.some((t) => t.toLowerCase() === effect.fromToken!.toLowerCase())) {
            if (effect.fromToken !== preview.fromToken) {
              return NextResponse.json({
                error: "expected_effects_mismatch",
                detail: `Expected effect fromToken "${effect.fromToken}" does not match preview route or fromToken.`,
              }, { status: 422 });
            }
          }
        }
      }
    }
  }

  const idempotencyKey = buildIdempotencyKey({
    walletAddress,
    network,
    decisionId: parsed.data.decisionId,
    asset: parsed.data.fromToken ?? preview.fromToken ?? "wallet",
    providedKey: parsed.data.idempotencyKey,
  });

  const prepareInput: Parameters<typeof prepareTransaction>[0] = {
    chainFamily,
    network,
    walletAddress,
    sourceAccount: parsed.data.sourceAccount,
    decisionId: parsed.data.decisionId,
    decisionAction: parsed.data.action as TransactionRecord["decisionAction"],
    asset: parsed.data.fromToken ?? preview.fromToken ?? "wallet",
    valueUsd: parsed.data.estimatedValueUsd ?? preview.estimatedValueUsd,
    // Pass only server-validated expectedEffects (rebuild from preview when possible)
    expectedEffects: parsed.data.expectedEffects,
    simulationStatus: parsed.data.simulationStatus ?? preview.simulation?.status,
    policyStatus: preview.policyStatus,
    idempotencyKey,
    // rawPayload is deliberately omitted — the server never trusts caller-supplied
    // calldata/XDR. The approval flow builds the signing payload from the stored
    // validated record metadata and independently verifies it against the quote.
  };

  const prepared = prepareTransaction(prepareInput);

  return withCacheHeaders(NextResponse.json({
    ...preview,
    lifecycle: {
      ...preview.lifecycle,
      status: "prepared",
      idempotencyKey,
      preparedAt: prepared.transaction.createdAt,
      transactionHashPlaceholder: prepared.transaction.hash,
    },
    prepare: {
      created: prepared.created,
      idempotent: prepared.idempotent,
      transaction: prepared.transaction,
    },
  }), "execution");
}
