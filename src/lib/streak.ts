const STREAK_KEY = "fitrate-streak";

type StreakData = {
  count: number;
  lastDate: string; // YYYY-MM-DD
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function load(): StreakData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    return raw ? (JSON.parse(raw) as StreakData) : null;
  } catch {
    return null;
  }
}

function save(data: StreakData): void {
  try {
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function getStreak(): number {
  return load()?.count ?? 0;
}

export function updateStreak(): { count: number; increased: boolean } {
  const today = todayDate();
  const prior = load();

  if (!prior) {
    save({ count: 1, lastDate: today });
    return { count: 1, increased: true };
  }

  const diff = daysBetween(prior.lastDate, today);

  if (diff === 0) {
    // Same day — idempotent
    return { count: prior.count, increased: false };
  }

  if (diff === 1) {
    // Consecutive day — extend streak
    const next = { count: prior.count + 1, lastDate: today };
    save(next);
    return { count: next.count, increased: true };
  }

  // Missed at least one day — reset
  save({ count: 1, lastDate: today });
  return { count: 1, increased: false };
}
