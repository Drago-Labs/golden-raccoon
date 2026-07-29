import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { assertApprovalOnly } from "@/server/security/policy";
import {
  applyStaleIfExpired,
  assertPrepareAllowedByRecovery,
  assertRecoveryChainFamily,
  getRecoveryRequest,
  markRecoveryConfirmed,
  markRecoverySubmitted,
  patchRecoveryRequest,
} from "@/server/recovery";
import { isTransactionHashForChain } from "@/lib/chainIdentity";

const evmHashPattern = /^0x[a-fA-F0-9]{64}$/;
const stellarHashPattern = /^[a-fA-F0-9]{64}$/;

const bodySchema = z.object({
  recoveryId: z.string().min(3),
  walletAddress: z.string().min(1),
  txHash: z.string().min(8).max(80),
  chainFamily: z.enum(["evm", "stellar"]),
  userApproved: z.literal(true),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:confirm", limit: 12, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ userApproved: parsed.data.userApproved, autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recovery policy failed" }, { status: 403 });
  }

  if (parsed.data.chainFamily === "evm" && !evmHashPattern.test(parsed.data.txHash)) {
    return NextResponse.json({ error: "invalid_evm_hash" }, { status: 400 });
  }

  if (parsed.data.chainFamily === "stellar" && !stellarHashPattern.test(parsed.data.txHash)) {
    return NextResponse.json({ error: "invalid_stellar_hash" }, { status: 400 });
  }

  if (parsed.data.chainFamily === "evm" && !isTransactionHashForChain(parsed.data.txHash, "evm")) {
    return NextResponse.json({ error: "hash_chain_mismatch" }, { status: 400 });
  }

  if (parsed.data.chainFamily === "stellar" && !isTransactionHashForChain(parsed.data.txHash, "stellar")) {
    return NextResponse.json({ error: "hash_chain_mismatch" }, { status: 400 });
  }

  const record = getRecoveryRequest(parsed.data.recoveryId);

  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (record.walletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch" }, { status: 403 });
  }

  const fresh = applyStaleIfExpired(record);

  if (fresh.status === "stale") {
    return NextResponse.json({ error: "stale_record", detail: "Recovery record became stale before submission. Re-prepare and submit again." }, { status: 409 });
  }

  if (fresh.status === "submitted" || fresh.status === "confirmed") {
    return NextResponse.json({ error: "already_submitted", status: fresh.status }, { status: 409 });
  }

  if (fresh.chainFamily && fresh.chainFamily !== "any" && fresh.chainFamily !== parsed.data.chainFamily) {
    return NextResponse.json({ error: "chain_mismatch", expected: fresh.chainFamily, received: parsed.data.chainFamily }, { status: 409 });
  }

  try {
    assertRecoveryChainFamily(fresh.recoveryType, fresh.chainFamily);
  } catch (error) {
    return NextResponse.json({ error: "chain_family_mismatch", detail: error instanceof Error ? error.message : "Recovery record has invalid chain family." }, { status: 409 });
  }

  // Submission continues even under incident mode (the prepare gate is for new plans, not confirms);
  // persist the bypass as a structured audit field on the record itself.
  const appliedDuringIncident = !assertPrepareAllowedByRecoverySafe();

  markRecoverySubmitted(parsed.data.recoveryId, parsed.data.txHash);
  if (appliedDuringIncident) {
    patchRecoveryRequest(parsed.data.recoveryId, { appliedDuringIncident: true });
  }
  const confirmed = markRecoveryConfirmed(parsed.data.recoveryId, parsed.data.txHash);

  if (!confirmed) {
    return NextResponse.json({ error: "patch_failed" }, { status: 500 });
  }

  return withCacheHeaders(NextResponse.json({ recovery: confirmed }), "recovery");
}

function assertPrepareAllowedByRecoverySafe(): boolean {
  try {
    assertPrepareAllowedByRecovery();
    return true;
  } catch {
    return false;
  }
}
