import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listDiscoveryCandidates } from "@/server/discovery/pipeline";
import type { DiscoveryCandidate } from "@/server/types";

const bodySchema = z.object({
  chain: z.string().min(1).max(64).optional(),
  provider: z.enum(["dexscreener", "stellar_market", "manual"]).default("manual"),
});

const fixtureCandidates: DiscoveryCandidate[] = [
  {
    id: "fixture-evm-clean",
    chain: "base",
    contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    tokenName: "Wrapped Ether",
    pairAddress: "0x4444444444444444444444444444444444444444",
    pairUrl: "https://dexscreener.com/base/weth",
    source: "dexscreener",
    sourceUrl: "https://dexscreener.com/base/weth",
    discoveredAt: new Date("2026-07-06T12:00:00.000Z").toISOString(),
    metrics: {
      liquidityUsd: 38_000_000,
      volume24hUsd: 6_500_000,
      fdvUsd: 12_500_000_000,
      fdvLiquidityRatio: 320,
      priceChange24hPercent: 1.4,
      pairAgeDays: 1500,
    },
    raw: { provider: "dexscreener" },
  },
  {
    id: "fixture-evm-thin",
    chain: "base",
    contractAddress: "0x4444444444444444444444444444444444444444",
    symbol: "THIN",
    tokenName: "Thin Liquidity Token",
    source: "dexscreener",
    discoveredAt: new Date("2026-07-06T12:00:00.000Z").toISOString(),
    metrics: {
      liquidityUsd: 12_000,
      volume24hUsd: 3_500,
      fdvUsd: 4_000_000,
      fdvLiquidityRatio: 333,
      priceChange24hPercent: 14.5,
      pairAgeDays: 1,
    },
    raw: { provider: "dexscreener" },
  },
  {
    id: "fixture-stellar-usdc",
    chain: "stellar-public",
    symbol: "USDC",
    tokenName: "USD Coin",
    assetType: "classic",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    source: "stellar_market",
    sourceUrl: "https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    discoveredAt: new Date("2026-07-06T12:00:00.000Z").toISOString(),
    metrics: {
      liquidityUsd: 250_000_000,
      volume24hUsd: 6_000_000,
      pairAgeDays: 2200,
    },
    raw: { provider: "stellar_expert" },
  },
];

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "discovery:candidates", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const candidates = await listDiscoveryCandidates(parsed.data.chain, {
    listCandidates: async (chain) => {
      const filtered = chain ? fixtureCandidates.filter((candidate) => candidate.chain === chain) : fixtureCandidates;

      return parsed.data.provider === "manual"
        ? fixtureCandidates
        : filtered.filter((candidate) => candidate.source === parsed.data.provider);
    },
  });

  return NextResponse.json({ candidates });
}
