import { Redis } from "@upstash/redis";
import type { AnalysisResult } from "@/types/analysis";

export type SharedResult = {
  id: string;
  createdAt: string;
  occasion: string;
  result: AnalysisResult;
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

export async function saveSharedResult(
  data: Omit<SharedResult, "id" | "createdAt">
): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedis();
    const id = generateId();
    const entry: SharedResult = { ...data, id, createdAt: new Date().toISOString() };
    await redis.set(`result:${id}`, entry, { ex: TTL_SECONDS });
    return id;
  } catch {
    return null;
  }
}

export async function getSharedResult(id: string): Promise<SharedResult | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedis();
    return await redis.get<SharedResult>(`result:${id}`);
  } catch {
    return null;
  }
}
