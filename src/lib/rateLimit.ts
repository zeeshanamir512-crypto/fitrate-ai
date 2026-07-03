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
 * Fails open (allows) when Redis is unconfigured or errors, to preserve availability.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS
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
    return { allowed: true };
  }
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
