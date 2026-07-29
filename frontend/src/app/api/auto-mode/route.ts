import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTO_MODE_POLICY_SCHEMA_VERSION } from "@/server/autoMode/policy";
import {
  getAutoModeSnapshot,
  saveAutoModePolicy,
} from "@/server/autoMode/storage";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";

const stopConditionsSchema = z.object({
  stopLossPercent: z.number().positive().max(100),
  takeProfitPercent: z.number().positive(),
  pauseOnCriticalRisk: z.literal(true),
  pauseOnSourceCoverageLoss: z.literal(true),
});

const policySchema = z.object({
  schemaVersion: z.literal(AUTO_MODE_POLICY_SCHEMA_VERSION),
  policyVersion: z.number().int().positive(),
  walletAddress: z.string().trim().min(1).max(120),
  maxDailyValueUsd: z.number().positive(),
  maxRiskScore: z.number().min(0).max(100),
  maxTradePercent: z.number().positive().max(100),
  maxSlippageBps: z.number().min(0).max(10_000),
  maxPriceImpactBps: z.number().min(0).max(10_000),
  allowedChains: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  allowedAssets: z.array(z.string().trim().min(1).max(240)).min(1).max(250),
  minStableReservePercent: z.number().min(0).max(100),
  stopConditions: stopConditionsSchema,
});

const updateSchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
  policy: policySchema,
  requestedEnabled: z.boolean(),
  explanationAccepted: z.boolean(),
  confirmExpansion: z.boolean().optional().default(false),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const suppliedWallet = request.nextUrl.searchParams.get("walletAddress");
  const session = resolveWalletSession(request, { suppliedWallet });
  if (session.response) return session.response;

  return withCacheHeaders(
    NextResponse.json(getAutoModeSnapshot(session.wallet!)),
    "rules",
  );
}
export async function PUT(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_auto_mode_policy", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = resolveWalletSession(request, {
    suppliedWallet: parsed.data.walletAddress,
  });
  if (session.response) return session.response;

  try {
    const result = saveAutoModePolicy({
      walletAddress: session.wallet!,
      policy: parsed.data.policy,
      requestedEnabled: parsed.data.requestedEnabled,
      explanationAccepted: parsed.data.explanationAccepted,
      expansionConfirmed: parsed.data.confirmExpansion,
    });

    if (!result.saved) {
      return NextResponse.json(
        {
          error: "policy_expansion_confirmation_required",
          expansionReasons: result.expansion.reasons,
          detail:
            "This change expands auto-mode authority. Review the changes and explicitly confirm before saving; a new wallet authorization will still be required.",
        },
        { status: 409 },
      );
    }

    return withCacheHeaders(
      NextResponse.json(getAutoModeSnapshot(session.wallet!)),
      "rules",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "auto_mode_policy_update_failed";
    const status = message === "policy_wallet_mismatch" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
