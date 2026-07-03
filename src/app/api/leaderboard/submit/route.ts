import { getSharedResult } from "@/lib/resultStore";
import { submitToLeaderboard } from "@/lib/leaderboardStore";
import { jsonPayload } from "@/lib/jsonResponse";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  if (!(await checkRateLimit(`lb-submit:${ip}`, 5)).allowed) {
    return jsonPayload({ error: "Too many submissions — please wait a moment." }, 429);
  }

  let body: { resultId?: string };
  try {
    body = (await request.json()) as { resultId?: string };
  } catch {
    return jsonPayload({ error: "Invalid JSON" }, 400);
  }

  const resultId = body?.resultId?.trim();
  if (!resultId || typeof resultId !== "string" || resultId.length > 64) {
    return jsonPayload({ error: "Missing or invalid resultId" }, 400);
  }

  const shared = await getSharedResult(resultId);
  if (!shared) {
    return jsonPayload({ error: "Result not found" }, 404);
  }

  const entry = {
    id: resultId,
    score: shared.result.overallRating,
    styleIdentity: shared.result.styleIdentity,
    occasion: shared.occasion,
    submittedAt: new Date().toISOString(),
    ...(shared.thumbnailUrl ? { thumbnailUrl: shared.thumbnailUrl } : {}),
  };

  const outcome = await submitToLeaderboard(entry);
  if (!outcome.ok) {
    if (outcome.error === "already_submitted") {
      return jsonPayload({ error: "already_submitted" }, 409);
    }
    return jsonPayload({ error: "Could not submit to leaderboard" }, 503);
  }

  return jsonPayload({ ok: true }, 200);
}
