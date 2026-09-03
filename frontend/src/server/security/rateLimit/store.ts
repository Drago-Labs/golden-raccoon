export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  bucketKey: string;
};

const memoryRoot = globalThis as typeof globalThis & {
  __goldenRaccoonRateLimit?: Map<string, { count: number; resetAt: number }>;
};

function getMemoryBuckets() {
  memoryRoot.__goldenRaccoonRateLimit ??= new Map();
  return memoryRoot.__goldenRaccoonRateLimit;
}

function toDecision(key: string, limit: number, count: number, resetAt: number, now: number, allowed: boolean): RateLimitDecision {
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
    bucketKey: key,
  };
}

function consumeMemory(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
  const buckets = getMemoryBuckets();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return toDecision(key, limit, 1, resetAt, now, true);
  }
  if (bucket.count >= limit) {
    return toDecision(key, limit, bucket.count, bucket.resetAt, now, false);
  }
  bucket.count += 1;
  return toDecision(key, limit, bucket.count, bucket.resetAt, now, true);
}

type RedisRestConfig = { url: string; token: string };

function getRedisRestConfig(): RedisRestConfig | undefined {
  const url = (process.env.RATE_LIMIT_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.RATE_LIMIT_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return undefined;
  return { url: url.replace(/\/$/, ""), token };
}

async function consumeRedis(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitDecision> {
  const config = getRedisRestConfig();
  if (!config) return consumeMemory(key, limit, windowMs, now);
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const redisKey = `gr:rl:${key}:${windowStart}`;
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, ttlSeconds]]),
      cache: "no-store",
    });
    if (!response.ok) return consumeMemory(key, limit, windowMs, now);
    const payload = (await response.json()) as Array<{ result?: number }>;
    const count = Number(payload[0]?.result ?? 1);
    const resetAt = windowStart + windowMs;
    return toDecision(key, limit, count, resetAt, now, count <= limit);
  } catch {
    return consumeMemory(key, limit, windowMs, now);
  }
}

export function getRateLimitStore() {
  return { kind: getRedisRestConfig() ? ("redis" as const) : ("memory" as const) };
}

export function consumeRateLimitSync(key: string, limit: number, windowMs: number, now?: number) {
  return consumeMemory(key, limit, windowMs, now);
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number, now?: number) {
  if (getRedisRestConfig()) return consumeRedis(key, limit, windowMs, now);
  return consumeMemory(key, limit, windowMs, now);
}

export function resetRateLimitBucket(key: string) {
  getMemoryBuckets().delete(key);
}

export function resetAllRateLimitBuckets() {
  getMemoryBuckets().clear();
}
