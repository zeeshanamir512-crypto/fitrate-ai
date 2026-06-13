import OpenAI from "openai";
import { NextResponse } from "next/server";

import { jsonPayload } from "@/lib/jsonResponse";
import { getOpenAiApiKey, OPENAI_API_KEY_SETUP_ERROR } from "@/lib/openaiApiKey";
import { parseJsonFromModelText } from "@/lib/parseModelJson";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OccasionMode = "Casual" | "School" | "Date" | "Gym" | "Party" | "Streetwear" | "Smart casual";

type OutfitCompareResult = {
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "Tie";
  closeness: "Clear win" | "Close win" | "Tie";
  winnerReason: string;
  outfitAFeedback: string;
  outfitBFeedback: string;
  weakerOutfitTips: string[];
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const OCCASIONS: OccasionMode[] = ["Casual", "School", "Date", "Gym", "Party", "Streetwear", "Smart casual"];

const outputExample: OutfitCompareResult = {
  scoreA: 8,
  scoreB: 7.5,
  winner: "A",
  closeness: "Close win",
  winnerReason:
    "Outfit A wins on cleaner layering balance and sneaker silhouette, but Outfit B still reads as solid streetwear with a narrower gap.",
  outfitAFeedback:
    "Outfit A has a strong relaxed streetwear silhouette—sharpening shoe shape or waist detail would elevate it slightly further.",
  outfitBFeedback:
    "Outfit B keeps a cohesive baggy hoodie + cargo story; a bolder focal point would help catch up.",
  weakerOutfitTips: [
    "Try a cropped jacket or structured overshirt for clearer shoulder line",
    "Add a stronger belt or waist tuck detail without losing the relaxed pants",
    "Make one accessory the hero piece (cleaner sneakers or cap/chain focal contrast)"
  ]
};

/** Scores are in 0.5 steps from 1 through 10 (e.g. 7, 7.5, 8). */
function clampHalfPointScore(value: unknown): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : 7;
  const clamped = Math.min(10, Math.max(1, base));
  const halfStep = Math.round(clamped * 2) / 2;
  return Math.min(10, Math.max(1, halfStep));
}

function normalizeWinner(value: unknown, scoreA: number, scoreB: number): OutfitCompareResult["winner"] {
  if (scoreA === scoreB) return "Tie";

  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "A" || raw === "OUTFIT A" || raw.startsWith("A ")) return "A";
  if (raw === "B" || raw === "OUTFIT B" || raw.startsWith("B ")) return "B";
  if (raw === "TIE" || raw === "TIED" || raw === "DRAW") return "Tie";
  if (scoreA > scoreB) return "A";
  if (scoreB > scoreA) return "B";
  return "Tie";
}

function normalizeCloseness(winner: OutfitCompareResult["winner"], scoreA: number, scoreB: number): OutfitCompareResult["closeness"] {
  const diff = Math.abs(scoreA - scoreB);
  if (winner === "Tie") return "Tie";

  // Half-point semantics: Close win iff margin is at most 1.0 point (e.g. 8 vs 7.5).
  if (diff <= 1) return "Close win";
  return "Clear win";
}

const STREET_ALIGNED_TIPS = [
  "Keep the baggy silhouette but tighten balance via belt/waist detail, cropped layer, or clearer shoe silhouette.",
  "Try a cropped jacket or structured overshirt to sharpen line without swapping to slim tailoring.",
  "Make one standout piece read louder (graphic focal, bolder chain contrast, cleaner sneaker archetype)—still street."
];

const OCCASION_NEUTRAL_TIPS = [
  "Clarify balance between footwear, bottoms, and top so the silhouette reads sharper for this occasion.",
  "Tie color accents together with one purposeful highlight instead of scattering contrast.",
  "Polish finishing details (fit line, layering edge, accessory scale) without changing the overall vibe abruptly."
];

function sanitizeCompare(parsed: Partial<OutfitCompareResult>, occasion: OccasionMode): OutfitCompareResult {
  const scoreA = clampHalfPointScore(parsed.scoreA);
  const scoreB = clampHalfPointScore(parsed.scoreB);
  const winner = normalizeWinner(parsed.winner, scoreA, scoreB);
  const closeness = normalizeCloseness(winner, scoreA, scoreB);

  const fillerTips = occasion === "Streetwear" || occasion === "Casual" ? STREET_ALIGNED_TIPS : OCCASION_NEUTRAL_TIPS;

  let tips = Array.isArray(parsed.weakerOutfitTips) ? parsed.weakerOutfitTips.map(String).filter(Boolean) : [];
  tips = [...tips, ...fillerTips].slice(0, 3);

  return {
    scoreA,
    scoreB,
    winner,
    closeness,
    winnerReason: String(parsed.winnerReason ?? "Slight advantage in cohesion while both looks stay occasion-appropriate."),
    outfitAFeedback: String(
      parsed.outfitAFeedback ?? "Keeps recognizable strengths visible in the overall styling direction."
    ),
    outfitBFeedback: String(
      parsed.outfitBFeedback ?? "Keeps recognizable strengths visible in the overall styling direction."
    ),
    weakerOutfitTips: tips
  };
}

/**
 * Mirrors single-analysis calibration: harsh 6 vs strong 8 often means unfair compare harshness—not real failure.
 */
function softenHarshPairScores(occasion: OccasionMode, result: OutfitCompareResult): void {
  const relaxed: OccasionMode[] = ["Streetwear", "Casual"];
  if (!relaxed.includes(occasion)) return;

  let { scoreA, scoreB } = result;
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);

  if (lo <= 6 && hi >= 7 && lo >= 5) {
    const target = clampHalfPointScore(Math.min(lo + 1, Math.min(hi, 9)));
    if (scoreA < scoreB) scoreA = Math.max(scoreA, target);
    else if (scoreB < scoreA) scoreB = Math.max(scoreB, target);
  }

  result.scoreA = clampHalfPointScore(scoreA);
  result.scoreB = clampHalfPointScore(scoreB);
  result.winner = normalizeWinner(result.winner, result.scoreA, result.scoreB);
  result.closeness = normalizeCloseness(result.winner, result.scoreA, result.scoreB);
}

/** When both looks are solid (>=7), avoid a gap wider than 1 full point (uses half steps). */
function balanceStrongPairScores(result: OutfitCompareResult): void {
  let { scoreA, scoreB } = result;
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  if (lo < 7 || hi - lo <= 1) return;

  const newLo = clampHalfPointScore(hi - 1);
  if (newLo <= lo) return;

  if (scoreA < scoreB) scoreA = newLo;
  else if (scoreB < scoreA) scoreB = newLo;
  else return;

  result.scoreA = clampHalfPointScore(scoreA);
  result.scoreB = clampHalfPointScore(scoreB);
  result.winner = normalizeWinner(result.winner, result.scoreA, result.scoreB);
  result.closeness = normalizeCloseness(result.winner, result.scoreA, result.scoreB);
}

function finalizeCompare(parsed: Partial<OutfitCompareResult>, occasion: OccasionMode): OutfitCompareResult {
  const base = sanitizeCompare(parsed, occasion);
  softenHarshPairScores(occasion, base);
  balanceStrongPairScores(base);
  return base;
}

function errorMessageForUser(error: unknown): { status: number; message: string } {
  if (error instanceof OpenAI.APIError) {
    const msg = (error.message || "").toLowerCase();
    if (error.status === 401 || error.code === "invalid_api_key") {
      return {
        status: 401,
        message: "OpenAI rejected your API key. Check OPENAI_API_KEY in .env.local and restart npm run dev."
      };
    }
    if (error.status === 429) {
      return {
        status: 429,
        message: "OpenAI rate limit or quota hit. Try again later or check billing."
      };
    }
    if (msg.includes("quota") || msg.includes("billing") || msg.includes("insufficient")) {
      return { status: 402, message: "OpenAI billing or credits issue." };
    }
    return { status: 502, message: `OpenAI error: ${error.message.slice(0, 180)}` };
  }
  return { status: 500, message: "Failed to compare outfits. Please try again." };
}

async function blobsToPayload(request: Request): Promise<
  { imageAUrl: string; imageBUrl: string; occasion: OccasionMode } | NextResponse
> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonPayload({ error: "Use multipart/form-data with fileA and fileB." }, 400);
  }

  try {
    const formData = await request.formData();
    const blobA = formData.get("fileA");
    const blobB = formData.get("fileB");
    const occasionRaw = String(formData.get("occasion") ?? "Casual");
    const occasion = OCCASIONS.includes(occasionRaw as OccasionMode) ? (occasionRaw as OccasionMode) : "Casual";

    if (!(blobA instanceof Blob) || !(blobB instanceof Blob)) {
      return jsonPayload({ error: "Missing fileA or fileB (image uploads)." }, 400);
    }

    if (blobA.size > MAX_UPLOAD_BYTES || blobB.size > MAX_UPLOAD_BYTES) {
      return jsonPayload({ error: "Each photo must be 4 MB or smaller." }, 400);
    }

    async function blobToUrl(blob: Blob): Promise<string> {
      const mime = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const base64 = Buffer.from(bytes).toString("base64");
      return `data:${mime};base64,${base64}`;
    }

    const [imageAUrl, imageBUrl] = await Promise.all([blobToUrl(blobA), blobToUrl(blobB)]);

    return { imageAUrl, imageBUrl, occasion };
  } catch (err) {
    console.error("Compare multipart parse error:", err);
    return jsonPayload(
      { error: "Could not read uploads. Try smaller JPG/PNG files, or wait until the dev server finishes compiling." },
      400
    );
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit(ip, 6).allowed) {
      return jsonPayload({ error: "Too many requests — please wait a moment and try again." }, 429);
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return jsonPayload({ error: OPENAI_API_KEY_SETUP_ERROR }, 500);
    }

    const payload = await blobsToPayload(request);
    if (payload instanceof NextResponse) return payload;
    const { imageAUrl, imageBUrl, occasion } = payload;

    const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
    const client = new OpenAI({
      apiKey,
      timeout: 90_000,
      maxRetries: 0
    });

    const baseComparePrompt = `You compare two outfits for FitRate AI. Occasion judging mode: "${occasion}".

FIRST — before doing anything else — check whether BOTH images contain a person wearing an outfit (clothing on a human body).
- If EITHER image does NOT show a person wearing clothes (e.g. food, objects, animals, landscapes, blank walls, text, screenshots, or anything that is clearly not a clothed human), immediately return this exact JSON and nothing else:
{"error":"no_outfit","message":"No outfit detected. Please upload a photo of yourself or someone wearing clothes."}
- If BOTH images contain people wearing outfits, proceed with the full comparison below.

You will see TWO full-frame outfit photos in order:
- Image A = Outfit A (first image)
- Image B = Outfit B (second image)

Evaluate BOTH images head-to-toe—shoes, pant hems, outer layers, bags, hats, headphones, chains, and proportions at frame edges matter. Assume photography may crop loosely; infer visible cues without treating relaxed street silhouettes as "sloppy by default".

Scoring granularity:
- Each outfit receives scoreA/scoreB as a number from 1 to 10 in HALF-POINT steps only: 1, 1.5, 2, …, 9.5, 10 (no tenths other than .5).
- Use .5 steps especially when the two outfits are close in quality so the margin can read naturally (e.g. 8 vs 7.5).
- When you pick "Close win", the score gap should USUALLY be 0.5 or 1 point—not wider—unless you also set closeness to "Clear win".
- If BOTH outfits are clearly strong for this occasion, keep scores clustered: do not put one far below the other unless that outfit has visible, concrete problems.

Score each outfit 1–10 (half steps) for how well THAT outfit satisfies "${occasion}" using the SAME philosophy as FitRate single-outfit analysis: intentionality, proportion balance, layering, color harmony and contrast, footwear shape and cohesion, accessory storytelling, polish vs real messiness—not generic Western formal polish.

Occasion-aligned rules (critical):
- For Casual: coordinated cap + chain + headphones stacks are normal relaxed layering; don't call them overloaded unless extras clearly clash or fight.
${occasion === "Streetwear"
        ? `
Streetwear (${occasion}) — match single-analysis calibration:
- Oversized, baggy, relaxed silhouettes are valid and often positive when intentional—do NOT punish baggy pants, oversized hoodies, cargos, or relaxed shapes by default.
- Positive signals include (when cohesive): roomy hoodies/shackets, baggy cargos/track pants, sneakers with strong shape, caps, headphones, layered chains, crossbodies—these can lift scores when harmonious.
- Do NOT default upgrade advice toward slim-fit, tapered, tailored, or fitted pants; intentional baggy is fine—sharpen with waist/belt emphasis, cropped or structured overshirt, cleaner sneaker profile, bolder focal graphic/accessory, or clearer layering tiers instead.
- Judge streetwear through intentionality, proportions within the oversized story, palette harmony/contrast, sneaker archetype cleanliness, accessory coordination, layering depth, and overall visual impact.
- Most respectable streetwear looks should score about 7.5–8.5 unless there is a standout execution; reserve ≤6 ONLY for clearer issues (severe clash, incoherent layers, footwear that breaks the fit, visibly chaotic styling, obvious fit-for-occasion miss).
`
        : ""}
${occasion === "Casual"
        ? `
Casual — relaxed calibration:
- Cohesive relaxed/street silhouettes deserve credit; casual should not chase corporate neatness unless the vibe is leaning preppy/smart.
- Typical solid casual compares land around mid–high 7s; use low 6s only when issues are visibly clear enough to merit it.
`
        : ""}

Pairwise fairness:
- If BOTH outfits clearly read well for "${occasion}", keep their scores tight—typically within 0.5–1 pt—unless the gap truly deserves "Clear win" with obvious visible separation.
- Close-call winners should almost always lean on half-point deltas (examples: 8 vs 7.5, 8.5 vs 7.5, 9 vs 8).

Feedback quality:
- NEVER use vague put-downs ("bulky and less polished", "sloppy silhouette") unless the outfit is genuinely messy/clashing—not merely relaxed or roomy.
- Prefer constructive specificity (e.g., "Strong relaxed streetwear silhouette; could elevate with cleaner sneaker shaping, sharper waist articulation, or more defined layering story").
- winnerReason MUST name what the viewer can see differs (graphic focal, color contrast, layering clarity, footwear shape, accessory intention, etc.).
- Mention the non-winner positively when it remains solid (especially for Close win).

Banned weak-outfit upgrade phrases (Streetwear/Casual): tailored pants; slim-fit; fitted bottoms; taper pants aggressively; reduce bulk; look more polished in a formal sense unless truly messy.

Preferred upgrade directions for relaxed modes:
- cropped jacket or structured overshirt; clearer belt/waist detail while keeping silhouette baggy;
- hero accessory/contrast focal; cleaner or more defined sneaker shape; sharper layering tiers while keeping roomy proportions.

closeness must be exactly one of:
- "Tie" (same score—identical numeric scoreA/scoreB after ties—or truly indistinguishable)
- "Close win" (winner ahead narrowly: prefer score gap of 0.5 or 1; never label "Close win" when the gap exceeds 1.5 points)
- "Clear win" (winner clearly stronger; score gap typically 1.5+ or one outfit has major visible issues vs the other)

winner must be exactly "A", "B", or "Tie".

Return ONLY valid JSON matching this shape (no markdown fences, no commentary):
${JSON.stringify(outputExample, null, 0)}

Strict field rules:
- scoreA and scoreB must be numeric half-step values (integers or ending in .5 only).
- outfitAFeedback / outfitBFeedback: one concise sentence EACH, only observations visible in THAT image.
- weakerOutfitTips: exactly THREE short bullets aimed at the lower-scoring outfit; if Tie, blend improvements usable by either—but never the banned tailoring/slim cues for Streetwear/Casual.`;


    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: baseComparePrompt },
            {
              type: "image_url",
              image_url: { url: imageAUrl, detail: "auto" }
            },
            {
              type: "image_url",
              image_url: { url: imageBUrl, detail: "auto" }
            }
          ]
        }
      ],
      max_tokens: 1100
    });

    const outputText = completion.choices[0]?.message?.content;
    if (!outputText) {
      return jsonPayload({ error: "No comparison returned from AI model." }, 502);
    }

    let parsed: Partial<OutfitCompareResult> & { error?: string; message?: string };
    try {
      parsed = parseJsonFromModelText<Partial<OutfitCompareResult> & { error?: string; message?: string }>(outputText);
    } catch {
      return jsonPayload({ error: "AI returned invalid JSON. Try again." }, 502);
    }

    if (parsed.error === "no_outfit") {
      return jsonPayload({ error: parsed.error, message: parsed.message }, 422);
    }

    let compare: OutfitCompareResult;
    try {
      compare = finalizeCompare(parsed, occasion);
    } catch (finalizeErr) {
      console.error("finalizeCompare error:", finalizeErr);
      return jsonPayload({ error: "Could not finalize comparison. Please try again." }, 502);
    }

    return jsonPayload({ compare }, 200);
  } catch (error: unknown) {
    console.error("Compare API error:", error);
    const { status, message } = errorMessageForUser(error);
    return jsonPayload({ error: message }, status);
  }
}
