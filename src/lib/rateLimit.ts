const WINDOW_MS = 60_000;

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

let pruneAt = Date.now() + WINDOW_MS * 10;
function maybePrune() {
  const now = Date.now();
  if (now < pruneAt) return;
  pruneAt = now + WINDOW_MS * 10;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

export function checkRateLimit(ip: string, limit: number): { allowed: boolean } {
  maybePrune();
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= limit) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
