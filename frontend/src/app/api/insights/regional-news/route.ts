import { NextResponse, type NextRequest } from "next/server";
import {
  buildRegionalNewsReport,
  regionalNewsRequestSchema,
  type FeedFetcher,
  type FeedItem,
} from "@/server/research/regional-news";
import { checkRateLimit } from "@/server/security/rateLimit";

export const dynamic = "force-dynamic";

type Body = {
  observedAt?: string;
  symbol?: string;
  chain?: string;
  contractOrIssuer?: string;
  feeds?: Record<string, FeedItem[]>;
};

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "regional-news", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = regionalNewsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const feeds = body.feeds;
  const fetchFeed: FeedFetcher | undefined = feeds
    ? async (source) => feeds[source.id] ?? []
    : undefined;

  const report = await buildRegionalNewsReport(parsed.data, { fetchFeed });
  return NextResponse.json({ report }, { headers: { "cache-control": "no-store" } });
}
