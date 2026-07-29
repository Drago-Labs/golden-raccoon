import { NextRequest, NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { RuleStorageError, getUserRuleRecord, upsertUserRuleRecord } from "@/server/storage";
import { validateStrategyProfile } from "@/server/rules/strategyProfile";
import { STRATEGY_PRESET_VERSION, listStrategyPresets } from "@/server/rules/presets";

/**
 * GET /api/rules?walletAddress=…
 *
 * Returns the wallet's stored profile plus the preset catalogue the editor
 * renders, so the client needs one request to draw the whole form.
 */
export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "rules", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;

  try {
    return withCacheHeaders(
      NextResponse.json({
        rule: getUserRuleRecord(walletAddress),
        presets: listStrategyPresets(),
        presetVersion: STRATEGY_PRESET_VERSION,
      }),
      "rules",
    );
  } catch (error) {
    if (error instanceof RuleStorageError) {
      return NextResponse.json({ error: error.message, code: "storage_unavailable" }, { status: 503 });
    }

    throw error;
  }
}

/**
 * POST /api/rules
 *
 * Validates and stores a profile. A failure is always reported as a failure:
 * the route never returns a success body for a write it did not complete, so
 * the editor cannot show a false "Saved" state.
 */
export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "rules:update", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const validation = validateStrategyProfile(body);

  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid strategy profile", issues: validation.issues }, { status: 400 });
  }

  try {
    // Defence in depth: the rule pipeline forces autoExecute off, and this
    // asserts the invariant held before anything is written.
    assertApprovalOnly({ autoExecute: validation.rule.autoExecute });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution policy failed" },
      { status: 403 },
    );
  }

  try {
    const rule = upsertUserRuleRecord(validation.rule);

    return withCacheHeaders(NextResponse.json({ rule, warnings: validation.warnings }), "rules");
  } catch (error) {
    if (error instanceof RuleStorageError) {
      return NextResponse.json({ error: error.message, code: "storage_unavailable" }, { status: 503 });
    }

    throw error;
  }
}
