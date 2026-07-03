import { NextResponse } from "next/server";
import { createBattle } from "@/lib/battleStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fitrate-ai.vercel.app";

export async function POST(request: Request) {
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = await checkRateLimit(`battle-create:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { idA: string; idB: string };
  try {
    body = (await request.json()) as { idA: string; idB: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.idA || !body?.idB || typeof body.idA !== "string" || typeof body.idB !== "string") {
    return NextResponse.json({ error: "idA and idB are required" }, { status: 400 });
  }

  if (body.idA === body.idB) {
    return NextResponse.json({ error: "A battle needs two different outfits" }, { status: 400 });
  }

  const result = await createBattle(body.idA, body.idB);

  if (!result.id) {
    return NextResponse.json({ error: result.error ?? "Failed to create battle" }, { status: 503 });
  }

  return NextResponse.json({ id: result.id, url: `${APP_URL}/battle/${result.id}` });
}
