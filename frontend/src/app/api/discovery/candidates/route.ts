import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getDiscoveredCandidates, getDiscoveredCandidatesByProvider, getDiscoveredCandidatesByChain, getDiscoveryServiceHealth } from "@/server/discovery";

const querySchema = z.object({
  provider: z.enum(["dexscreener_new_pairs", "stellar_market"]).optional(),
  chain: z.string().min(1).max(40).optional(),
  includeHealth: z.coerce.boolean().optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "discovery:candidates", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    provider: params.get("provider") ?? undefined,
    chain: params.get("chain") ?? undefined,
    includeHealth: params.get("includeHealth") === "true" ? true : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    let candidates;

    if (parsed.data.provider) {
      candidates = getDiscoveredCandidatesByProvider(parsed.data.provider);
    } else if (parsed.data.chain) {
      candidates = getDiscoveredCandidatesByChain(parsed.data.chain);
    } else {
      candidates = getDiscoveredCandidates();
    }

    const response: Record<string, unknown> = {
      ok: true,
      count: candidates.length,
      candidates,
      checkedAt: new Date().toISOString(),
    };

    if (parsed.data.includeHealth) {
      response.health = getDiscoveryServiceHealth();
    }

    return withCacheHeaders(NextResponse.json(response), "scan");
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Discovery service error",
      },
      { status: 500 },
    );
  }
}
