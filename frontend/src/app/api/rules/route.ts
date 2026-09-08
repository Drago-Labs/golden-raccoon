import { NextRequest, NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord, upsertUserRuleRecord } from "@/server/storage";
import {
  chainFamilySchema,
  validateChainScopedWallet,
} from "@/server/security/inputValidation";
import { evaluateCapability } from "@/server/security/authz";
import { validateRule } from "@/server/rules/validate";
import { RuleMigrationError } from "@/server/rules/migrate";
import { listStrategyPresets, STRATEGY_PRESET_VERSION } from "@/server/rules/presets";
import { jsonError } from "@/server/api/errors";

export const AUTHZ_CAPABILITY = "rules:write" as const;

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "rules", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const chainFamily = chainFamilySchema.safeParse(
    request.nextUrl.searchParams.get("chainFamily") ?? undefined,
  );
  const network = request.nextUrl.searchParams.get("network") ?? undefined;

  try {
    const record = getUserRuleRecord(walletAddress, {
      chainFamily: chainFamily.success ? chainFamily.data : undefined,
      network,
    });
    return withCacheHeaders(
      NextResponse.json({
        ...record,
        rule: record,
        presets: listStrategyPresets(),
        presetVersion: STRATEGY_PRESET_VERSION,
      }),
      "rules",
    );
  } catch (error) {
    if (error instanceof RuleMigrationError) {
      return jsonError(
        {
          code: "validation_error",
          message: error.message,
          status: error.status,
          details: error.issues,
        },
        { legacy: { error: error.message, issues: error.issues } },
      );
    }
    return jsonError({ code: "internal_error", message: "Failed to load rules", status: 500 });
  }
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "rules:update", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      {
        code: "validation_error",
        message: "Malformed JSON payload",
        status: 400,
        details: ["Malformed JSON payload"],
      },
      { legacy: { error: "Malformed JSON payload", issues: [{ field: "body", message: "Malformed JSON" }] } },
    );
  }

  const payload = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const sanitized = { ...payload, autoExecute: false };
  const validation = validateRule(sanitized);

  if (!validation.ok) {
    return jsonError(
      {
        code: "validation_error",
        message: validation.error,
        status: 400,
        details: validation.issues,
      },
      { legacy: { error: validation.error, issues: validation.issues } },
    );
  }

  const candidate = validation.rule;
  if (candidate.chainFamily && !validateChainScopedWallet(candidate)) {
    return jsonError(
      {
        code: "validation_error",
        message: "Wallet address does not match chainFamily/network.",
        status: 400,
        details: ["Wallet address does not match chainFamily/network."],
      },
      { legacy: { error: "Wallet address does not match chainFamily/network." } },
    );
  }

  try {
    const authz = evaluateCapability(
      {
        kind: "wallet",
        walletAddress: candidate.walletAddress,
        walletHash: "route",
        chainFamily: candidate.chainFamily,
        network: candidate.network?.toLowerCase(),
      },
      AUTHZ_CAPABILITY,
      {
        walletAddress: candidate.walletAddress,
        chainFamily: candidate.chainFamily,
        network: candidate.network,
      },
    );
    if (!authz.allowed) {
      return jsonError({
        code: "auth_error",
        message: authz.reason ?? "Unauthorized",
        status: 403,
      });
    }
    assertApprovalOnly({ autoExecute: candidate.autoExecute });
  } catch (error) {
    return jsonError({
      code: "auth_error",
      message: error instanceof Error ? error.message : "Execution policy failed",
      status: 403,
    });
  }

  const stored = upsertUserRuleRecord({
    ...candidate,
    autoExecute: false,
    ...(candidate.version !== undefined ? { version: candidate.version } : {}),
    createdAt: candidate.createdAt ?? new Date().toISOString(),
  });

  return withCacheHeaders(
    NextResponse.json({
      ...stored,
      rule: stored,
    }),
    "rules",
  );
}
