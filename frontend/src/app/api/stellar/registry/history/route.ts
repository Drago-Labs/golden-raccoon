import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeStellarNetworkId } from "@/lib/stellar/config";
import { listRiskPublicationHistory, getRiskPublicationByTxHash } from "@/server/stellar/riskHistory";
import { checkRateLimit } from "@/server/security/rateLimit";

const querySchema = z.object({
  network: z.string().optional(),
  txHash: z.string().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const limited = checkRateLimit(request, { namespace: "stellar:registry:history", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    network: params.get("network") ?? undefined,
    txHash: params.get("txHash") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.txHash) {
      const network = normalizeStellarNetworkId(parsed.data.network ?? undefined);
      if (!network) {
        return NextResponse.json({ error: "Network is required when querying by txHash" }, { status: 400 });
      }
      const record = getRiskPublicationByTxHash(network, parsed.data.txHash);
      return NextResponse.json({ ok: true, record: record ?? null });
    }

    const network = parsed.data.network
      ? normalizeStellarNetworkId(parsed.data.network) ?? undefined
      : undefined;
    const records = listRiskPublicationHistory(network);

    return NextResponse.json({ ok: true, count: records.length, records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read risk publication history" },
      { status: 500 },
    );
  }
}
