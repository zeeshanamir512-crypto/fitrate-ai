import { NextResponse } from "next/server";
import { saveSharedCompareResult } from "@/lib/compareResultStore";
import { FLAGGED_IMAGE_MESSAGE, moderateImage } from "@/lib/moderation";
import { getOpenAiApiKey } from "@/lib/openaiApiKey";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyResultToken } from "@/lib/resultSignature";
import { isOccasion } from "@/lib/occasions";
import type { OutfitCompareResult } from "@/types/compare";

const IS_DEV = process.env.NODE_ENV === "development";

/** Reject comparisons whose displayed text is implausibly long — defense-in-depth
 *  behind the signature (a valid token already guarantees server-produced content). */
function textFieldsWithinLimits(compare: OutfitCompareResult): boolean {
  const checks: Array<[unknown, number]> = [
    [compare.winnerReason, 600],
    [compare.outfitAFeedback, 600],
    [compare.outfitBFeedback, 600],
  ];
  if (!checks.every(([v, max]) => typeof v !== "string" || v.length <= max)) return false;
  if (!Array.isArray(compare.weakerOutfitTips)) return false;
  return compare.weakerOutfitTips.every((t) => typeof t !== "string" || t.length <= 300);
}

/** Only accept a data: JPEG thumbnail within the same size budget as save-result. */
function validThumbnail(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.startsWith("data:image/jpeg;base64,") &&
    value.length <= 51200
    ? value
    : undefined;
}

export async function POST(request: Request) {
  const ip = getClientIp(new Headers(request.headers));
  const { allowed } = await checkRateLimit(`savecompare:${ip}`, 10);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { compare: OutfitCompareResult; occasion: string; token?: string; thumbnailA?: string; thumbnailB?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body?.compare ||
    typeof body.compare.scoreA !== "number" ||
    typeof body.compare.scoreB !== "number"
  ) {
    return NextResponse.json({ error: "Invalid comparison data" }, { status: 400 });
  }

  // Only accept comparisons that carry a valid signature from a real /api/compare call.
  // This blocks fabricated scores/text being posted straight to save-compare.
  if (!verifyResultToken(body.compare, body.token)) {
    return NextResponse.json({ error: "Unverified comparison. Please re-run the compare." }, { status: 403 });
  }

  if (!textFieldsWithinLimits(body.compare)) {
    return NextResponse.json({ error: "Invalid comparison data" }, { status: 400 });
  }

  // Occasion travels outside the signed comparison, so whitelist it explicitly.
  const occasion = isOccasion(body.occasion) ? body.occasion : null;
  if (!occasion) {
    return NextResponse.json({ error: "Invalid occasion" }, { status: 400 });
  }

  let thumbnailA = validThumbnail(body.thumbnailA);
  let thumbnailB = validThumbnail(body.thumbnailB);

  // Both thumbnails are client-generated and become public on /compare-r/[id] — NOT
  // covered by the HMAC token. Screen them before publishing, same fail-closed policy
  // as save-result: flagged → reject outright; moderation outage → keep the (signed,
  // safe) text comparison but drop the unscreened images. Moderate in parallel.
  if (thumbnailA || thumbnailB) {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      thumbnailA = undefined;
      thumbnailB = undefined;
    } else {
      const [verdictA, verdictB] = await Promise.all([
        thumbnailA ? moderateImage(apiKey, thumbnailA) : Promise.resolve({ ok: true } as const),
        thumbnailB ? moderateImage(apiKey, thumbnailB) : Promise.resolve({ ok: true } as const),
      ]);

      if (
        (!verdictA.ok && verdictA.reason === "flagged") ||
        (!verdictB.ok && verdictB.reason === "flagged")
      ) {
        console.warn("[save-compare] thumbnail rejected by moderation");
        return NextResponse.json({ error: FLAGGED_IMAGE_MESSAGE }, { status: 422 });
      }
      if (!verdictA.ok) thumbnailA = undefined;
      if (!verdictB.ok) thumbnailB = undefined;
    }
  }

  const saved = await saveSharedCompareResult({
    compare: body.compare,
    occasion,
    ...(thumbnailA ? { thumbnailA } : {}),
    ...(thumbnailB ? { thumbnailB } : {}),
  });

  if (!saved.id) {
    console.error("[save-compare] saveSharedCompareResult returned null id. error:", saved.error);
    return NextResponse.json(
      IS_DEV
        ? { error: "Storage not available", debug: { redisError: saved.error, urlPresent: !!process.env.UPSTASH_REDIS_REST_URL, tokenPresent: !!process.env.UPSTASH_REDIS_REST_TOKEN } }
        : { error: "Storage not available" },
      { status: 503 }
    );
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fitrate-ai.vercel.app";
  return NextResponse.json({ id: saved.id, url: `${APP_URL}/compare-r/${saved.id}` });
}
