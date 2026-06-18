import { Redis } from "@upstash/redis";

export type LeaderboardEntry = {
  id: string;
  score: number;
  styleIdentity: string;
  thumbnailUrl?: string;
  occasion: string;
  submittedAt: string;
};

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis(): Redis {
  return Redis.fromEnv();
}

export function getCurrentWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // nearest Thursday (ISO week anchor)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function getWeekLabel(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday));
  return monday.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export async function submitToLeaderboard(
  entry: LeaderboardEntry
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRedisConfigured()) return { ok: false, error: "Redis not configured" };
  try {
    const redis = getRedis();
    const week = getCurrentWeek();
    const lbKey = `leaderboard:${week}`;
    const metaKey = `lb:meta:${week}:${entry.id}`;

    // ZADD NX: returns 1 if newly added, 0 if already present — free dedup
    const added = await redis.zadd(lbKey, { nx: true }, { score: entry.score, member: entry.id });
    if (added === 0) return { ok: false, error: "already_submitted" };

    await Promise.all([
      redis.set(metaKey, entry, { ex: TTL_SECONDS + 5 * 24 * 60 * 60 }),
      redis.expire(lbKey, TTL_SECONDS),
    ]);

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[leaderboardStore] submitToLeaderboard failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!isRedisConfigured()) return [];
  try {
    const redis = getRedis();
    const week = getCurrentWeek();
    const ids = (await redis.zrange(`leaderboard:${week}`, 0, 49, { rev: true })) as string[];
    if (ids.length === 0) return [];

    const pipe = redis.pipeline();
    for (const id of ids) pipe.get(`lb:meta:${week}:${id}`);
    const metas = (await pipe.exec()) as (LeaderboardEntry | null)[];

    return metas.filter((m): m is LeaderboardEntry => m !== null);
  } catch (err) {
    console.error("[leaderboardStore] getLeaderboard failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
