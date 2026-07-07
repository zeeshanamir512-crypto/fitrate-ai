import { NextResponse } from "next/server";
import { createBattle } from "@/lib/battleStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fitrate-ai.vercel.app";

/**
 * Creates an OPEN battle from a single saved result. The challenger's slot is
 * filled later via /api/battle/[id]/join — see the one-link battle flow.
 */
export async function POST(request: Request) {
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = await checkRateLimit(`battle-create:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { idA: string };
  try {
    body = (await request.json()) as { idA: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.idA || typeof body.idA !== "string") {
    return NextResponse.json({ error: "idA is required" }, { status: 400 });
  }

  const result = await createBattle(body.idA);

  if (!result.id) {
    return NextResponse.json({ error: result.error ?? "Failed to create battle" }, { status: 503 });
  }

  return NextResponse.json({ id: result.id, url: `${APP_URL}/battle/${result.id}` });
}
