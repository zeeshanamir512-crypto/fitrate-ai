import { NextResponse } from "next/server";
import { getBattle, incrementVote } from "@/lib/battleStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = checkRateLimit(`battle-vote:${ip}`, 20);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { side: string };
  try {
    body = (await request.json()) as { side: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body?.side !== "a" && body?.side !== "b") {
    return NextResponse.json({ error: "side must be 'a' or 'b'" }, { status: 400 });
  }

  const battle = await getBattle(id);
  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const votes = await incrementVote(id, body.side);
  const total = votes.a + votes.b;
  return NextResponse.json({
    a: votes.a,
    b: votes.b,
    total,
    percentA: total > 0 ? Math.round((votes.a / total) * 100) : 50,
    percentB: total > 0 ? Math.round((votes.b / total) * 100) : 50,
  });
}
