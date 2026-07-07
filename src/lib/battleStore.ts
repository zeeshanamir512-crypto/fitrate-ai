import { Redis } from "@upstash/redis";
import { getSharedResult, type SharedResult } from "./resultStore";

export type BattleEntry = {
  id: string;
  resultA: SharedResult;
  /**
   * null = "open" battle waiting for a challenger; populated = "active".
   * Battle state is derived from this field rather than stored separately so
   * the two can never disagree. Pre-open-battle records (created before
   * 2026-07) always have resultB populated and read as active unchanged.
   */
  resultB: SharedResult | null;
  createdAt: string;
  /** Set when the challenger's result lands (battle becomes active). */
  joinedAt?: string;
};

export type JoinBattleOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_joined" | "result_not_found" | "same_result" | "unavailable" };

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

/** Create an OPEN battle from a single shared result; a challenger joins later via joinBattle. */
export async function createBattle(
  idA: string
): Promise<{ id: string; error?: never } | { id: null; error: string }> {
  if (!isRedisConfigured()) return { id: null, error: "Redis not configured" };

  const resultA = await getSharedResult(idA);
  if (!resultA) return { id: null, error: "Result not found" };

  try {
    const redis = getRedis();
    const id = generateId();
    const entry: BattleEntry = { id, resultA, resultB: null, createdAt: new Date().toISOString() };
    await redis.set(`battle:${id}`, entry, { ex: TTL_SECONDS });
    return { id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[battleStore] createBattle failed:", msg);
    return { id: null, error: msg };
  }
}

/** Fill the open slot of a battle with the challenger's shared result. */
export async function joinBattle(id: string, resultId: string): Promise<JoinBattleOutcome> {
  if (!isRedisConfigured()) return { ok: false, reason: "unavailable" };
  try {
    const redis = getRedis();
    const battle = await redis.get<BattleEntry>(`battle:${id}`);
    if (!battle) return { ok: false, reason: "not_found" };
    if (battle.resultB) return { ok: false, reason: "already_joined" };
    if (battle.resultA.id === resultId) return { ok: false, reason: "same_result" };

    const resultB = await getSharedResult(resultId);
    if (!resultB) return { ok: false, reason: "result_not_found" };

    // Upstash REST has no WATCH/MULTI optimistic locking, so an NX claim key is
    // the atomic guard: of two simultaneous joins, only one can win this SET and
    // proceed to write resultB; the loser reports "already_joined".
    const claimed = await redis.set(`battle:${id}:claim`, resultId, { nx: true, ex: TTL_SECONDS });
    if (claimed !== "OK") return { ok: false, reason: "already_joined" };

    const updated: BattleEntry = { ...battle, resultB, joinedAt: new Date().toISOString() };
    // Fresh 30-day TTL from join: the battle's voting life starts when it
    // becomes active, not when the open link was first created.
    await redis.set(`battle:${id}`, updated, { ex: TTL_SECONDS });
    return { ok: true };
  } catch (err) {
    console.error("[battleStore] joinBattle failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "unavailable" };
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
    // INCR alone never sets a TTL, so vote counters used to outlive their 30-day
    // battle forever. Refresh the expiry on each vote to match the battle's lifetime.
    await redis.pipeline().incr(key).expire(key, TTL_SECONDS).exec();
    return getBattleVotes(id);
  } catch {
    return getBattleVotes(id);
  }
}
