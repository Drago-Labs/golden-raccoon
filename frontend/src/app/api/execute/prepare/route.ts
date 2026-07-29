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
  /** Pre-built EVM calldata (0x-prefixed hex) or Stellar envelope XDR (base64) */
  rawPayload: z.string().optional(),
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
    expectedEffects: parsed.data.expectedEffects,
    simulationStatus: parsed.data.simulationStatus ?? preview.simulation?.status,
    policyStatus: preview.policyStatus,
    idempotencyKey,
    rawPayload: parsed.data.rawPayload,
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
