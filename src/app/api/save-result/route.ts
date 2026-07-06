import { NextResponse } from "next/server";
import { saveSharedResult } from "@/lib/resultStore";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyResultToken } from "@/lib/resultSignature";
import { isOccasion } from "@/lib/occasions";
import type { AnalysisResult } from "@/types/analysis";

const IS_DEV = process.env.NODE_ENV === "development";

/** Reject results whose displayed text is implausibly long — defense-in-depth behind
 *  the signature (a valid token already guarantees server-produced content). */
function textFieldsWithinLimits(result: AnalysisResult): boolean {
  const checks: Array<[unknown, number]> = [
    [result.styleIdentity, 200],
    [result.mainFeedback, 600],
    [result.colorAdvice, 400],
    [result.bestPart, 300],
    [result.weakestPart, 300],
  ];
  return checks.every(([v, max]) => typeof v !== "string" || v.length <= max);
}

export async function POST(request: Request) {
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = await checkRateLimit(`save:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { result: AnalysisResult; occasion: string; thumbnailUrl?: string; token?: string };
  try {
    body = (await request.json()) as { result: AnalysisResult; occasion: string; thumbnailUrl?: string; token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.result || typeof body.result.overallRating !== "number") {
    return NextResponse.json({ error: "Invalid result data" }, { status: 400 });
  }

  // Only accept results that carry a valid signature from a real /api/analyze call.
  // This blocks fabricated scores/text/images being posted straight to save-result.
  if (!verifyResultToken(body.result, body.token)) {
    return NextResponse.json({ error: "Unverified result. Please re-run the analysis." }, { status: 403 });
  }

  if (!textFieldsWithinLimits(body.result)) {
    return NextResponse.json({ error: "Invalid result data" }, { status: 400 });
  }

  // Occasion travels outside the signed result, so whitelist it explicitly.
  const occasion = isOccasion(body.occasion) ? body.occasion : null;
  if (!occasion) {
    return NextResponse.json({ error: "Invalid occasion" }, { status: 400 });
  }

  const thumbnailUrl =
    typeof body.thumbnailUrl === "string" &&
    body.thumbnailUrl.startsWith("data:image/jpeg;base64,") &&
    body.thumbnailUrl.length <= 51200
      ? body.thumbnailUrl
      : undefined;

  const saved = await saveSharedResult({
    result: body.result,
    occasion,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
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
