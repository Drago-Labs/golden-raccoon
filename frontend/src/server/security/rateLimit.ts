import { NextRequest, NextResponse } from "next/server";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  namespace: string;
};

const buckets = globalThis as typeof globalThis & {
  __goldenRaccoonRateLimit?: Map<string, { count: number; resetAt: number }>;
};

function getBuckets() {
  buckets.__goldenRaccoonRateLimit ??= new Map();

  return buckets.__goldenRaccoonRateLimit;
}

export function getClientKey(request: Request | NextRequest, namespace: string) {
  const headers = request.headers;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip");

  return `${namespace}:${forwardedFor || realIp || "local"}`;
}

export function checkRateLimit(request: Request | NextRequest, options: RateLimitOptions) {
  const key = getClientKey(request, options.namespace);
  const now = Date.now();
  const bucket = getBuckets().get(key);

  if (!bucket || bucket.resetAt <= now) {
    getBuckets().set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  if (bucket.count >= options.limit) {
    const response = NextResponse.json(
      {
        error: "rate_limited",
        detail: `Too many ${options.namespace} requests. Try again after ${new Date(bucket.resetAt).toISOString()}.`,
      },
      { status: 429 },
    );

    response.headers.set("Retry-After", Math.ceil((bucket.resetAt - now) / 1000).toString());

    return response;
  }

  bucket.count += 1;

  return null;
}
