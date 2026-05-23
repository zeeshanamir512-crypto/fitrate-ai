import { NextResponse } from "next/server";
import { saveSharedResult } from "@/lib/resultStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { AnalysisResult } from "@/types/analysis";

export async function POST(request: Request) {
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = checkRateLimit(`save:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { result: AnalysisResult; occasion: string };
  try {
    body = (await request.json()) as { result: AnalysisResult; occasion: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.result || typeof body.result.overallRating !== "number") {
    return NextResponse.json({ error: "Invalid result data" }, { status: 400 });
  }

  const id = await saveSharedResult({
    result: body.result,
    occasion: body.occasion ?? "Casual",
  });

  if (!id) {
    return NextResponse.json({ error: "Storage not available" }, { status: 503 });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fitrate-ai.vercel.app";
  return NextResponse.json({ id, url: `${APP_URL}/r/${id}` });
}
