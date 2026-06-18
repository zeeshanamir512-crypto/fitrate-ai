import { getLeaderboard, getCurrentWeek, getWeekLabel } from "@/lib/leaderboardStore";
import { jsonPayload } from "@/lib/jsonResponse";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(`lb-read:${ip}`, 60).allowed) {
    return jsonPayload({ error: "Too many requests" }, 429);
  }

  const entries = await getLeaderboard();
  return jsonPayload({ entries, week: getCurrentWeek(), weekLabel: getWeekLabel() }, 200);
}
