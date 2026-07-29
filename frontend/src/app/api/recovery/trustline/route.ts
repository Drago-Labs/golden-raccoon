import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { assertApprovalOnly } from "@/server/security/policy";
import { createRecoveryRequest, getRecoveryConsequences, getPolicyVersion, getIncidentMode } from "@/server/recovery";

const bodySchema = z.object({
  walletAddress: z.string().min(1),
  network: z.string().min(1),
  asset: z.string().min(3).max(180),
  consumer: z.string().max(64).optional(),
  // Issuer G-address is surfaced separately as the asset's auth authority.
  reserveXlm: z.string().max(16).optional(),
  expectedFeeXlm: z.string().max(16).optional(),
  lastVerifiedLedger: z.number().int().positive().optional(),
  issuerRevocable: z.boolean().optional(),
  issuerClawback: z.boolean().optional(),
  reason: z.string().min(1).max(280).optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:trustline", limit: 12, windowMs: 60_000 });

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recovery policy failed" }, { status: 403 });
  }

  const record = createRecoveryRequest({
    walletAddress: parsed.data.walletAddress,
    recoveryType: "remove_trustline",
    chainId: parsed.data.network,
    chainFamily: "stellar",
    asset: parsed.data.asset,
    consumer: parsed.data.consumer,
    status: "prepared",
    incidentMode: getIncidentMode().enabled,
    consequences: getRecoveryConsequences({
      recoveryType: "remove_trustline",
      chainFamily: "stellar",
      asset: parsed.data.asset,
      consumer: parsed.data.consumer,
      stellarReserveXlm: parsed.data.reserveXlm,
      stellarExpectedFeeXlm: parsed.data.expectedFeeXlm,
      issuerRevocable: parsed.data.issuerRevocable,
      issuerClawback: parsed.data.issuerClawback,
    }),
    lastVerifiedLedger: parsed.data.lastVerifiedLedger,
    reservedNativeAmount: parsed.data.reserveXlm,
    expectedFee: parsed.data.expectedFeeXlm,
    reason: parsed.data.reason,
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });

  return withCacheHeaders(NextResponse.json({ recovery: record }), "recovery");
}
