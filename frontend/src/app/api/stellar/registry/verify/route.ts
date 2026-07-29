import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeStellarNetworkId } from "@/lib/stellar/config";
import { isTransactionHashForChain } from "@/lib/chainIdentity";
import { verifyRiskPublication } from "@/server/stellar/riskVerify";
import { checkRateLimit } from "@/server/security/rateLimit";

const bodySchema = z.object({
  network: z.string(),
  hash: z.string().min(1).max(100),
  localReportHash: z.string().optional(),
  assetKey: z.string().min(1).max(180).optional(),
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "stellar:registry:verify", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const network = normalizeStellarNetworkId(parsed.data.network);
  if (!network || !isTransactionHashForChain(parsed.data.hash, "stellar")) {
    return NextResponse.json({ error: "Invalid Stellar network or transaction hash" }, { status: 400 });
  }

  try {
    const outcome = await verifyRiskPublication(network, parsed.data.hash, {
      localReportHash: parsed.data.localReportHash,
      assetKey: parsed.data.assetKey,
    });

    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify registry transaction" },
      { status: 502 },
    );
  }
}
