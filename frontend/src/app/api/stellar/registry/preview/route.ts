import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeStellarNetworkId } from "@/lib/stellar/config";
import { isStellarAccountAddress } from "@/lib/chainIdentity";
import { getRiskPublicationPreview } from "@/server/stellar/riskPreview";
import { checkRateLimit } from "@/server/security/rateLimit";

const bodySchema = z.object({
  network: z.string(),
  publisher: z.string().refine(isStellarAccountAddress, "Expected Stellar G-address"),
  assetKey: z.string().min(1).max(180),
  assetLabel: z.string().min(1).max(180),
  score: z.number().int().min(0).max(100),
  verdict: z.string().regex(/^[a-zA-Z0-9_]{1,32}$/),
  evidenceUri: z.string().max(512).default(""),
  updatedAt: z.number().int().positive().optional(),
  report: z.unknown(),
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "stellar:registry:preview", limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const network = normalizeStellarNetworkId(parsed.data.network);
  if (!network) {
    return NextResponse.json({ error: "Unsupported Stellar network" }, { status: 400 });
  }

  try {
    const preview = await getRiskPublicationPreview(network, {
      ...parsed.data,
      report: parsed.data.report ?? {},
      updatedAt: parsed.data.updatedAt ?? Math.floor(Date.now() / 1000),
    });

    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not preview registry transaction" },
      { status: 502 },
    );
  }
}
