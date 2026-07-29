import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { assertApprovalOnly } from "@/server/security/policy";
import { createRecoveryRequest, getRecoveryConsequences, getPolicyVersion, getIncidentMode } from "@/server/recovery";
import { validateContractAddressForChain } from "@/server/security/inputValidation";

const bodySchema = z.object({
  walletAddress: z.string().min(1),
  action: z.enum(["reduce", "revoke"]),
  network: z.string().min(1).optional(),
  chainFamily: z.literal("evm"),
  asset: z.string().max(128),
  consumer: z.string().max(128),
  currentAllowance: z.string().max(64).optional(),
  newAllowance: z.string().max(64).optional(),
  isInfiniteApproval: z.boolean().optional(),
  expectedFeeUsd: z.string().max(16).optional(),
  lastVerifiedBlockNumber: z.number().int().positive().optional(),
  reason: z.string().min(1).max(280).optional(),
}).superRefine((value, context) => {
  if (value.action === "reduce" && !value.newAllowance) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["newAllowance"], message: "Reduce action must specify a new non-zero allowance." });
  }
  if (value.network && !validateContractAddressForChain(value.asset, value.network)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["asset"], message: "Asset address does not match the selected chain." });
  }
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:allowance", limit: 12, windowMs: 60_000 });

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

  const recoveryType = parsed.data.action === "reduce" ? "reduce_allowance" : "revoke_allowance";

  const record = createRecoveryRequest({
    walletAddress: parsed.data.walletAddress,
    recoveryType,
    chainId: parsed.data.network,
    chainFamily: "evm",
    asset: parsed.data.asset,
    consumer: parsed.data.consumer,
    amount: parsed.data.action === "reduce" ? parsed.data.newAllowance : "0",
    status: "prepared",
    incidentMode: getIncidentMode().enabled,
    consequences: getRecoveryConsequences({
      recoveryType,
      chainFamily: "evm",
      asset: parsed.data.asset,
      consumer: parsed.data.consumer,
      evmExpectedFeeUsd: parsed.data.expectedFeeUsd,
      isInfiniteApproval: parsed.data.isInfiniteApproval,
      currentAllowance: parsed.data.currentAllowance,
      newAllowance: parsed.data.newAllowance,
    }),
    lastVerifiedBlockNumber: parsed.data.lastVerifiedBlockNumber,
    reason: parsed.data.reason,
    reservedNativeAmount: undefined,
    expectedFee: parsed.data.expectedFeeUsd,
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });

  return withCacheHeaders(NextResponse.json({ recovery: record }), "recovery");
}
