import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { assertApprovalOnly } from "@/server/security/policy";
import { createRecoveryRequest, getRecoveryConsequences, getPolicyVersion, getIncidentMode } from "@/server/recovery";
import { validateContractAddressForChain } from "@/server/security/inputValidation";

const bodySchema = z.object({
  walletAddress: z.string().min(1),
  network: z.string().min(1).optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  reason: z.string().min(1).max(280).optional(),
  expectedAgent: z.enum(["execution", "decision"]).optional(),
  contractAddress: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:pause", limit: 10, windowMs: 60_000 });

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

  if (parsed.data.contractAddress && parsed.data.chainFamily && !validateContractAddressForChain(parsed.data.contractAddress, parsed.data.network)) {
    return NextResponse.json({ error: "contract_address_mismatch_chain" }, { status: 400 });
  }

  const record = createRecoveryRequest({
    walletAddress: parsed.data.walletAddress,
    recoveryType: "pause_agent",
    chainId: parsed.data.network,
    chainFamily: parsed.data.chainFamily ?? "evm",
    asset: parsed.data.contractAddress,
    status: "prepared",
    incidentMode: getIncidentMode().enabled,
    consequences: getRecoveryConsequences({
      recoveryType: "pause_agent",
      chainFamily: parsed.data.chainFamily ?? "evm",
    }),
    reason: parsed.data.reason,
    policyVersion: getPolicyVersion(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    preparedAt: new Date().toISOString(),
  });

  return withCacheHeaders(NextResponse.json({ recovery: record }), "recovery");
}
