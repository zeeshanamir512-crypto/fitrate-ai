import { Redis } from "@upstash/redis";

const DEFAULT_WINDOW_SECONDS = 60;

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) redisClient = Redis.fromEnv();
  return redisClient;
}

/**
 * Redis-backed fixed-window rate limit. Works across serverless instances
 * (the in-memory Map it replaced did not).
 *
 * `key` should already be namespaced by route + identifier, e.g. `analyze:1.2.3.4`.
 *
 * When Redis is *unconfigured* (e.g. local dev), always allows — there is nothing to
 * count against. When Redis is configured but *errors*, the default is to fail open
 * (preserve availability); pass `failClosed: true` on expensive paid-API routes
 * (analyze/compare) so a Redis outage rejects instead of exposing unlimited spend.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
  options?: { failClosed?: boolean }
): Promise<{ allowed: boolean }> {
  if (!isRedisConfigured()) return { allowed: true };

  const rlKey = `ratelimit:${key}`;
  try {
    const redis = getRedis();
    // `SET NX` with an expiry seeds the counter with a guaranteed TTL from birth,
    // so a key can never get stuck without expiry; `INCR` then bumps the count.
    // Both run in one pipelined round-trip.
    const results = (await redis
      .pipeline()
      .set(rlKey, 0, { ex: windowSeconds, nx: true })
      .incr(rlKey)
      .exec()) as [unknown, number];
    const count = results[1];
    return { allowed: count <= limit };
  } catch (err) {
    console.error("[rateLimit] check failed:", err instanceof Error ? err.message : String(err));
    return { allowed: !options?.failClosed };
  }
}

/**
 * Global daily cap across ALL callers for the expensive vision routes, so a
 * rotating-IP attack can't run up an unbounded OpenAI bill while staying under the
 * per-IP limit. analyze and compare share one `daily-calls:{date}` counter, so the
 * limit is the combined total. Fails closed (Redis error → reject) since its whole
 * job is protecting spend. Allows when Redis is unconfigured (local dev).
 */
export async function checkDailyCallCap(limit: number): Promise<{ allowed: boolean }> {
  if (!isRedisConfigured()) return { allowed: true };

  const date = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const key = `daily-calls:${date}`;
  try {
    const redis = getRedis();
    const results = (await redis
      .pipeline()
      .set(key, 0, { ex: 2 * 24 * 60 * 60, nx: true }) // 2-day TTL: self-cleans past days
      .incr(key)
      .exec()) as [unknown, number];
    return { allowed: results[1] <= limit };
  } catch (err) {
    console.error("[rateLimit] daily cap check failed:", err instanceof Error ? err.message : String(err));
    return { allowed: false };
  }
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
