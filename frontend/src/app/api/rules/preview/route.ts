import { NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord } from "@/server/storage";
import { validateRule } from "@/server/rules/validate";
import { calculateRuleDiff } from "@/server/rules/diff";
import { previewRule, type CandidateSignal } from "@/server/rules/preview";
import { jsonError } from "@/server/api/errors";

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "rules:preview", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const rawRule = body.rule !== undefined ? body.rule : body;
  const customSignals = Array.isArray(body.signals) ? (body.signals as CandidateSignal[]) : undefined;

  const validation = validateRule(rawRule);

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
  let savedRule = null;
  try {
    savedRule = getUserRuleRecord(candidate.walletAddress, {
      chainFamily: candidate.chainFamily,
      network: candidate.network,
    });
  } catch {
    savedRule = null;
  }

  const diff = calculateRuleDiff(savedRule, candidate);
  const preview = previewRule(candidate, customSignals);

  return NextResponse.json({
    ok: true,
    rule: candidate,
    diff,
    preview,
    warnings: validation.warnings,
  });
}
