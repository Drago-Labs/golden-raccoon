import { NextResponse } from "next/server";
import { jsonError } from "@/server/api/errors";
import { z } from "zod";
import { gateFeature } from "@/server/features/evaluator";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";
import { buildServerTimingHeader, createPhaseTimer, recordApiTiming } from "@/server/observability/timing";
import { createCacheKey, getOrLoad, serverCache, walletCacheTag, resourceCacheTag } from "@/server/cache";
import { withRouteSpan } from "@/server/observability/tracing/spans";

const bodySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
  walletAddress: z.string().min(1).max(80).optional(),
});

const API_TIMING_ROUTE = "scan:token";

export async function POST(request: Request) {
  return withRouteSpan("scan.token", { "http.method": "POST" }, async () => {
  const requestStartedAt = performance.now();
  const rateLimited = checkRateLimit(request, { namespace: "scan:token", limit: 25, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError({ code: "validation_error", message: "Invalid input", status: 400, details: parsed.error.flatten() });
  }

  const scanGate = gateFeature("scan_token", parsed.data.walletAddress ?? "");
  if (!scanGate.enabled) {
    return NextResponse.json(
      { error: "feature_disabled", feature: "scan_token", detail: scanGate.detail },
      { status: 403 },
    );
  }

  const timer = createPhaseTimer();
  const chainFamily = parsed.data.chain?.startsWith("stellar") ? "stellar" : "evm";
  const cached = await getOrLoad({
    store: serverCache,
    key: createCacheKey({ chainFamily, network: parsed.data.chain ?? "legacy-evm", walletAddress: parsed.data.walletAddress, resource: "scan", params: { query: parsed.data.query } }),
    loader: () => runTokenScan(parsed.data.query, parsed.data.chain, parsed.data.walletAddress, timer),
    ttlMs: 15_000,
    staleMs: 30_000,
    tags: [resourceCacheTag("scan"), parsed.data.walletAddress ? walletCacheTag(parsed.data.walletAddress) : "anonymous"],
  });
  if (cached.state === "negative") return jsonError({ code: "provider_timeout", message: "Scan provider is temporarily unavailable.", status: 503 });
  const result = cached.value;
  const timing = timer.finish();

  recordApiTiming(API_TIMING_ROUTE, performance.now() - requestStartedAt);

  const response = withCacheHeaders(NextResponse.json({ ...result, timing }), "scan");
  response.headers.set("X-Cache-Status", cached.state);
  response.headers.set("Server-Timing", buildServerTimingHeader(timing));

  return response;
  });
}
