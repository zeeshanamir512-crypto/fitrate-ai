/**
 * UI feature flags.
 *
 * Leaderboard is hidden from the UI until there's enough traffic for weekly
 * rankings to look alive (a 3-entry leaderboard reads as dead, not social).
 * Everything behind it is intact: the /leaderboard page, /api/leaderboard +
 * /api/leaderboard/submit, and the Redis store all still work. Only the entry
 * points are gated — flip this to `true` to bring the feature back everywhere.
 */
export const LEADERBOARD_ENABLED: boolean = false;

/**
 * Battle Mode is hidden from the UI the same way as the leaderboard above.
 * Everything behind it is intact: /battle/[id] still renders, /api/battle/create,
 * /api/battle/[id]/join and /api/battle/[id]/vote all still work, and existing
 * shared battle links keep resolving and accepting votes. Only the entry points
 * that *start* a battle are gated — flip this to `true` to bring it back everywhere.
 */
export const BATTLES_ENABLED: boolean = false;
