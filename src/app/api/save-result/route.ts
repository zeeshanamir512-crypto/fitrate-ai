import { NextResponse } from "next/server";
import { saveSharedResult } from "@/lib/resultStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { AnalysisResult } from "@/types/analysis";

const IS_DEV = process.env.NODE_ENV === "development";

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

  const saved = await saveSharedResult({
    result: body.result,
    occasion: body.occasion ?? "Casual",
  });

  if (!saved.id) {
    console.error("[save-result] saveSharedResult returned null id. error:", saved.error);
    return NextResponse.json(
      IS_DEV
        ? { error: "Storage not available", debug: { redisError: saved.error, urlPresent: !!process.env.UPSTASH_REDIS_REST_URL, tokenPresent: !!process.env.UPSTASH_REDIS_REST_TOKEN } }
        : { error: "Storage not available" },
      { status: 503 }
    );
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fitrate-ai.vercel.app";
  return NextResponse.json({ id: saved.id, url: `${APP_URL}/r/${saved.id}` });
}
