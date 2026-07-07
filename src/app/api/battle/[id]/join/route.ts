import { NextResponse } from "next/server";
import { joinBattle } from "@/lib/battleStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/**
 * Fills the open slot of a battle with the challenger's saved result. The
 * resultId must reference a result created through /api/save-result, which is
 * where HMAC verification and thumbnail moderation already happened — this
 * route only wires an existing, verified result into the battle.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = await checkRateLimit(`battle-join:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { resultId: string };
  try {
    body = (await request.json()) as { resultId: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.resultId || typeof body.resultId !== "string") {
    return NextResponse.json({ error: "resultId is required" }, { status: 400 });
  }

  const outcome = await joinBattle(id, body.resultId);
  if (outcome.ok) {
    return NextResponse.json({ ok: true });
  }

  switch (outcome.reason) {
    case "not_found":
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    case "already_joined":
      return NextResponse.json({ error: "Someone already joined this battle" }, { status: 409 });
    case "result_not_found":
      return NextResponse.json({ error: "Result not found — re-run your analysis" }, { status: 400 });
    case "same_result":
      return NextResponse.json({ error: "A battle needs two different outfits" }, { status: 400 });
    default:
      return NextResponse.json({ error: "Battle service unavailable" }, { status: 503 });
  }
}
