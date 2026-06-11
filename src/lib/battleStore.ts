import { Redis } from "@upstash/redis";
import { getSharedResult, type SharedResult } from "./resultStore";

export type BattleEntry = {
  id: string;
  resultA: SharedResult;
  resultB: SharedResult;
  createdAt: string;
};

export type BattleVotes = {
  a: number;
  b: number;
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

export async function createBattle(
  idA: string,
  idB: string
): Promise<{ id: string; error?: never } | { id: null; error: string }> {
  if (!isRedisConfigured()) return { id: null, error: "Redis not configured" };

  const [resultA, resultB] = await Promise.all([
    getSharedResult(idA),
    getSharedResult(idB),
  ]);

  if (!resultA) return { id: null, error: "Result A not found" };
  if (!resultB) return { id: null, error: "Result B not found" };

  try {
    const redis = getRedis();
    const id = generateId();
    const entry: BattleEntry = { id, resultA, resultB, createdAt: new Date().toISOString() };
    await redis.set(`battle:${id}`, entry, { ex: TTL_SECONDS });
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[battleStore] createBattle failed:", msg);
    return { id: null, error: msg };
  }
}

export async function getBattle(id: string): Promise<BattleEntry | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getRedis();
    return await redis.get<BattleEntry>(`battle:${id}`);
  } catch (err) {
    console.error("[battleStore] getBattle failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getBattleVotes(id: string): Promise<BattleVotes> {
  if (!isRedisConfigured()) return { a: 0, b: 0 };
  try {
    const redis = getRedis();
    const [a, b] = await Promise.all([
      redis.get<number>(`battle:${id}:va`),
      redis.get<number>(`battle:${id}:vb`),
    ]);
    return { a: a ?? 0, b: b ?? 0 };
  } catch {
    return { a: 0, b: 0 };
  }
}

export async function incrementVote(
  id: string,
  side: "a" | "b"
): Promise<BattleVotes> {
  if (!isRedisConfigured()) return { a: 0, b: 0 };
  try {
    const redis = getRedis();
    const key = side === "a" ? `battle:${id}:va` : `battle:${id}:vb`;
    await redis.incr(key);
    return getBattleVotes(id);
  } catch {
    return getBattleVotes(id);
  }
}
