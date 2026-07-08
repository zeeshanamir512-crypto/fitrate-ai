import { Redis } from "@upstash/redis";
import type { OutfitCompareResult } from "@/types/compare";

/**
 * Storage for shared two-outfit comparisons behind /compare-r/[id]. Deliberately a
 * thin parallel of resultStore.ts (single results) rather than reusing SharedResult:
 * a comparison has two scores + a winner and no AnalysisResult, so forcing it into the
 * single-result shape would mean fabricating fields. Distinct `cmp:` key prefix keeps
 * it clear of `result:` and `battle:`.
 */
export type SharedCompareResult = {
  id: string;
  createdAt: string;
  occasion: string;
  compare: OutfitCompareResult;
  /** Client-generated thumbnails; only stored after moderation in /api/save-compare. */
  thumbnailA?: string;
  thumbnailB?: string;
};

const TTL_SECONDS = 30 * 24 * 60 * 60;

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis(): Redis {
  return Redis.fromEnv();
}

function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveSharedCompareResult(
  data: Omit<SharedCompareResult, "id" | "createdAt">
): Promise<{ id: string; error?: never } | { id: null; error: string }> {
  if (!isRedisConfigured()) {
    const msg = "Redis env vars missing (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)";
    console.error("[compareResultStore]", msg);
    return { id: null, error: msg };
  }
  try {
    const redis = getRedis();
    const id = generateId();
    const entry: SharedCompareResult = { ...data, id, createdAt: new Date().toISOString() };
    await redis.set(`cmp:${id}`, entry, { ex: TTL_SECONDS });
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[compareResultStore] Redis.set failed:", msg);
    return { id: null, error: msg };
  }
}

export async function getSharedCompareResult(id: string): Promise<SharedCompareResult | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedis();
    return await redis.get<SharedCompareResult>(`cmp:${id}`);
  } catch (err) {
    console.error("[compareResultStore] Redis.get failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
