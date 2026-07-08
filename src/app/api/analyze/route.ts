import OpenAI from "openai";
import { NextResponse } from "next/server";

import { FASHION_BADGE_IDS, inferFashionBadges, sanitizeFashionBadges } from "@/lib/fashionBadges";
import { jsonPayload } from "@/lib/jsonResponse";
import { getOpenAiApiKey, OPENAI_API_KEY_SETUP_ERROR } from "@/lib/openaiApiKey";
import { parseJsonFromModelText } from "@/lib/parseModelJson";
import { FLAGGED_IMAGE_MESSAGE, MODERATION_UNAVAILABLE_MESSAGE, moderateImage } from "@/lib/moderation";
import { checkDailyCallCap, checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { signResult } from "@/lib/resultSignature";
import { OCCASIONS, type OccasionMode } from "@/lib/occasions";
import type { AnalysisResult, Difficulty } from "@/types/analysis";

export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_CALL_CAP = Number(process.env.DAILY_CALL_LIMIT) || 500;

type AnalyzeRequestPayload = {
  imageDataUrl: string;
  occasion: OccasionMode;
  brutalMode: boolean;
  autoDetectOccasion: boolean;
};

const outputFormatExample: AnalysisResult = {
  overallRating: 8.4,
  aiConfidence: 84,
  detectedItems: {
    outerwear: "none visible",
    top: "grey oversized hoodie over black tee",
    bottoms: "navy baggy cargo pants",
    shoes: "white low-top sneakers",
    accessories: ["red cap", "silver chain", "black headphones"],
    mainColors: ["grey", "black", "navy", "white", "red"],
    silhouette: "oversized top with baggy bottoms, intentionally relaxed proportions",
    styleVibe: "modern streetwear"
  },
  scoreBreakdown: {
    fit: 8.3,
    colorMatching: 7.2,
    shoes: 7.4,
    accessories: 7.1,
    occasion: 7.9,
    trendLevel: 7.6
  },
  scoreReasons: {
    fit: "The oversized hoodie and baggy cargos feel intentional and balanced by cleaner sneakers.",
    colorMatching: "Grey, black, and navy create a cohesive base while the red cap adds controlled contrast.",
    shoes: "White sneakers lighten the outfit and keep the heavy silhouette from feeling too dense.",
    accessories: "Cap, chain, and headphones support the streetwear vibe without looking random.",
    occasion: "This reads clearly as streetwear and matches the selected occasion mode well.",
    trendLevel: "Layering, proportions, and accessory choices feel current and style-aware."
  },
  styleIdentity: "Clean smart-casual energy with a minimal streetwear edge.",
  mainFeedback:
    "The slim top and darker trousers give a polished smart-casual base, but adding better shoe contrast and one accessory would make it look more complete.",
  colorAdvice: "Keep your neutral base, then add one lighter accent color in shoes or accessories for balanced contrast.",
  bestPart: "Intentional streetwear proportions with clean sneaker contrast.",
  weakestPart: "Upper layer could be sharper to create clearer structure around the shoulders.",
  upgradeIdeas: [
    {
      title: "Add contrast sneakers",
      description: "White or light grey sneakers would brighten the lower half and make the outfit feel more modern.",
      difficulty: "Easy"
    },
    {
      title: "Add one clean accessory",
      description: "A simple watch or chain adds intention without making the outfit look busy.",
      difficulty: "Easy"
    },
    {
      title: "Sharpen upper-body shape",
      description: "Try a cropped jacket, structured overshirt, or shorter hoodie to improve upper-body shape.",
      difficulty: "Medium"
    }
  ],
  dos: ["Use one accent piece", "Keep silhouette proportions balanced", "Match footwear with outfit mood"],
  donts: [
    "Avoid adding too many extra accessories beyond what you're already coordinating",
    "Avoid sneakers that look too bulky compared to how your pants hang",
    "Avoid overly bulky top layers with zero structure around the neckline or waist"
  ],
  fitCorrections: [
    "Hem the cargos ~2cm — they're pooling too much over the sneakers",
    "Size down the hoodie a touch to sharpen the shoulder line"
  ],
  stylingIdeas: [
    "Push the hoodie sleeves up and flip the cap backwards for a looser look",
    "Tuck the front hem of the hoodie into the cargos to define the waist",
    "Swap the white sneakers for boots to dress this same fit up"
  ],
  styleKeywords: ["smart casual", "minimal", "clean", "balanced"],
  fashionBadges: ["Clean Minimalist", "Streetwear King"]
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // keep requests small and fast

function clampScore(value: unknown): number {
  const n = Number(value ?? 7);
  const safe = Number.isFinite(n) ? n : 7;
  // Quantize to one decimal place so the API never emits floating-point tails
  // (e.g. 7.34 or 8.599999). Scores are intentionally decimal (1.0-10.0) to
  // avoid clustering on whole numbers and .5s. NaN/missing still falls back to 7.
  return Math.min(10, Math.max(1, Math.round(safe * 10) / 10));
}

function clampPercent(value: unknown): number {
  const n = Number(value ?? 80);
  return Math.min(100, Math.max(0, Number.isFinite(n) ? n : 80));
}

function normalizeDifficulty(value: unknown): Difficulty {
  if (value === "Easy" || value === "Medium" || value === "Hard") return value;
  return "Easy";
}

function sanitizeStringList(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, cap);
}

function hasAnySignal(text: string, signals: string[]): boolean {
  const lower = text.toLowerCase();
  return signals.some((signal) => lower.includes(signal));
}

function matchesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

/**
 * Style words that mark an outfit as belonging to the relaxed/streetwear lane.
 * Shared by the accessory-score floor and the streetwear occasion floor
 * (which historically carried separate but identical copies of this list).
 */
const STREETWEAR_STYLE_SIGNALS = [
  "streetwear",
  "oversized",
  "baggy",
  "relaxed",
  "casual",
  "skater",
  "urban",
  "layered",
  "sporty"
];

/**
 * WHY: several compensations below raise accessory-related scores or soften
 * accessory criticism, but they must NOT fire when the model reports a real
 * accessory clash. This detects genuine clash language in the model's text so
 * those compensations stay conservative. The "too many accessories" phrasings
 * only count as clash evidence at 6+ detected accessories — below that, the
 * model is usually just over-penalizing a normal stack.
 */
function hasAccessoryClashEvidence(context: string, accessoryCount: number): boolean {
  const lower = context.toLowerCase();
  const hardSignals = [
    "accessories clash",
    "accessory clash",
    "clashing accessories",
    "competing accessories",
    "accessories compete",
    "accessories fight",
    "fighting for attention",
    "random accessories",
    "gaudy accessor",
    "accessories feel loud",
    "loud accessor clash"
  ];
  if (matchesAny(lower, hardSignals)) return true;
  if (
    accessoryCount >= 6 &&
    (lower.includes("too many accessory") ||
      lower.includes("too accessorized") ||
      lower.includes("over accessorized") ||
      lower.includes("over-accessor"))
  )
    return true;
  return false;
}

/**
 * WHY: cap + chain + headphones is the canonical casual/streetwear accessory
 * stack, and the one the model most often mislabels as "too many accessories".
 * The ≤4 cap keeps this from matching genuinely crowded looks.
 */
function hasCapChainHeadphoneTrio(accessories: string[]): boolean {
  if (accessories.length === 0) return false;
  const blob = accessories.map((a) => a.toLowerCase()).join(" ");
  const hasHead = /\b(cap|snapback|trucker hat|dad hat|baseball hat|fitted hat)\b|\bbeanie\b/.test(blob);
  const hasChain = /\b(chain|necklace)\b/.test(blob);
  const hasPhones = /\b(headphones?|earbuds?)\b|\bbeats\b/i.test(blob);
  return hasHead && hasChain && hasPhones && accessories.length <= 4;
}

/**
 * WHY: guards against the model's favorite generic tip — "add white/contrast
 * sneakers" — when the detected shoes are already white or light-toned.
 * Phrases like "triple white" / "all white" are covered by the "white" hint.
 */
function shoesAppearWhiteOrLight(shoesDesc: string): boolean {
  const shoeLower = shoesDesc.toLowerCase();
  const looksDarkFootwear =
    /\bblack\b|\bbrown\b|\bwine\b|\bburgundy\b|\bcharcoal\b|\bdark\b.*\b(navy|grey|gray|brown)\b|\bdark\b.*\bred\b/.test(shoeLower) &&
    !/\bwhite\b|\bcream\b|\bsail\b/.test(shoeLower);

  const lightHints = [
    "white",
    "cream",
    "ivory",
    "off-white",
    "off white",
    "beige",
    "bone",
    "sail",
    "egret",
    "light grey",
    "light gray"
  ];
  const looksLight = lightHints.some((w) => shoeLower.includes(w));
  const lightGreySneakers =
    /\b(sneaker|trainer|footwear)\b/.test(shoeLower) &&
    /\b(light|silver|dust|cloud|ash|steel)\b/.test(shoeLower) &&
    /\b(grey|gray)\b/.test(shoeLower);

  if (!(looksLight || lightGreySneakers)) return false;
  if (looksDarkFootwear) return false;
  return true;
}

/**
 * Step 6a of the pipeline — WHY: even when scores are fine, the model's prose
 * often calls a normal cap+chain+headphones trio "overloaded". Scrub that
 * phrasing so the text does not contradict the accessory-score floor applied
 * right after this (which audits these same fields for clash evidence).
 */
function sanitizeSoftAccessoryOverloadLabels(result: AnalysisResult): void {
  if (!hasCapChainHeadphoneTrio(result.detectedItems.accessories)) return;

  const scrubOverload = (text: string): string =>
    text
      .replace(/\boverloaded with accessories\b/gi, "not overloaded across accessories")
      .replace(/\baccessory overload\b/gi, "a coordinated trio")
      .replace(/\bover[- ]accessorized\b/gi, "accessorized intentionally")
      // DEAD: the trailing \b means this never matches the intended "crowded
      // accessories"/"crowded accessorizing" (a word character follows
      // "accessor", so there is no boundary) — it only matches a bare
      // "crowded accessor", which the model does not emit. The replacement
      // text also looks like a typo for "accessory details". Kept in place
      // during the 2026-07 refactor; fixing or removing it is a behavior
      // decision for a dedicated follow-up.
      .replace(/\bcrowded accessor\b/gi, "accessor details")
      .replace(/\s{2,}/g, " ")
      .trim();

  result.scoreReasons.accessories = scrubOverload(result.scoreReasons.accessories);
  result.mainFeedback = scrubOverload(result.mainFeedback);
  result.weakestPart = scrubOverload(result.weakestPart);
}

/**
 * Step 6b of the pipeline — WHY: despite prompt rules saying coordinated
 * stacks "should usually be 7/10 or higher", the model routinely under-scores
 * accessories for normal casual/streetwear stacks. Floor the score at 7 when
 * a recognized stack is worn and nothing in the (already rewritten) text
 * provides real clash evidence. Must run AFTER the overload-label scrub and
 * the donts rewrites, because the audit below reads those rewritten fields.
 */
function maybeRaiseAccessoryScoreForRelaxedModes(result: AnalysisResult, occasion: OccasionMode): void {
  const relaxed: OccasionMode[] = ["Casual", "Streetwear"];
  if (!relaxed.includes(occasion)) return;

  const acc = result.detectedItems.accessories;
  const n = acc.length;
  const audit = [result.scoreReasons.accessories, result.mainFeedback, result.weakestPart, result.donts.join(" ")].join(" ");

  if (result.scoreBreakdown.accessories >= 7) return;
  if (hasAccessoryClashEvidence(audit, n)) return;

  const trioMatch = hasCapChainHeadphoneTrio(acc);
  const styleSignalText = `${result.detectedItems.styleVibe} ${result.styleKeywords.join(" ")}`;
  const hasStreetStyleHint = hasAnySignal(styleSignalText, STREETWEAR_STYLE_SIGNALS);
  const streetStack =
    occasion === "Streetwear" &&
    hasClassicStreetwearAccessoryStack(acc) &&
    n <= 5 &&
    (hasStreetStyleHint || countStreetwearSignals(result.detectedItems) >= 2);

  if (!trioMatch && !streetStack) return;

  result.scoreBreakdown.accessories = 7;
  result.scoreReasons.accessories = `${result.scoreReasons.accessories} Coordinated cap + chain + headphones-type stacks read normal for casual/streetwear unless something clashes.`;
}

/**
 * WHY: broader companion to hasCapChainHeadphoneTrio — recognizes any loose
 * combination of standard streetwear accessories (cap/bag/belt/watch/…) so
 * the accessory-score floor also covers stacks that aren't the exact trio.
 */
function hasClassicStreetwearAccessoryStack(accessories: string[]): boolean {
  if (accessories.length === 0) return false;
  const lower = accessories.map((a) => a.toLowerCase()).join(" | ");
  const hits = [
    "cap",
    "hat",
    "beanie",
    "headphones",
    "chain",
    "crossbody",
    "bag",
    "belt",
    "watch"
  ].filter((key) => lower.includes(key));
  return hits.length >= 2 || (accessories.length >= 2 && hits.length >= 1);
}

/**
 * WHY: cheap visual proxy for "this is actually a streetwear outfit", derived
 * from detected items rather than the model's (less reliable) style text.
 * Used to justify score floors: each matching signal group adds 1, and the
 * callers require 2-3+ signals before adjusting anything.
 * NOTE: the "over" check is intentionally broad — it also matches oversized,
 * pullover, overshirt, etc. (preserved from the original implementation).
 */
function countStreetwearSignals(detected: AnalysisResult["detectedItems"]): number {
  let count = 0;
  const checks = [
    `${detected.outerwear} ${detected.top}`,
    detected.bottoms,
    detected.shoes,
    detected.silhouette,
    detected.accessories.join(" ")
  ].map((value) => value.toLowerCase());

  if (checks.some((value) => value.includes("hoodie") && value.includes("oversized"))) count += 1;
  if (checks.some((value) => value.includes("baggy") || value.includes("cargo"))) count += 1;
  if (checks.some((value) => value.includes("cap"))) count += 1;
  if (checks.some((value) => value.includes("headphones"))) count += 1;
  if (checks.some((value) => value.includes("sneakers") || value.includes("trainer"))) count += 1;
  if (checks.some((value) => value.includes("layered") || value.includes("over"))) count += 1;
  if (checks.some((value) => value.includes("loose") && value.includes("silhouette"))) count += 1;

  return count;
}

// DEAD: unreachable — only called from backfillAiConfidence(), whose guard can
// never be true (see the DEAD note there). Kept in place during the 2026-07
// refactor pending a decision on restoring visibility-based confidence
// estimates for responses that omit aiConfidence.
function estimateConfidenceFromDetected(result: AnalysisResult): number {
  const visibilityText = [
    result.detectedItems.outerwear,
    result.detectedItems.top,
    result.detectedItems.bottoms,
    result.detectedItems.shoes,
    result.detectedItems.silhouette,
    result.mainFeedback
  ]
    .join(" ")
    .toLowerCase();

  if (visibilityText.includes("not clearly visible") || visibilityText.includes("unclear") || visibilityText.includes("blurry")) {
    return 68;
  }
  if (result.detectedItems.top === "Not clearly visible" || result.detectedItems.bottoms === "Not clearly visible") {
    return 72;
  }
  return 86;
}

/* -------------------------------------------------------------------------- *
 * sanitizeResult pipeline
 *
 * The vision model's JSON is post-processed by the ordered steps below. Each
 * step compensates for a specific, repeatedly-observed failure in raw model
 * output that prompt rules alone did not fix (the prompt already forbids most
 * of these behaviors; the model drifts anyway). Steps run in a fixed order
 * because some steps read text that earlier steps rewrite — see
 * sanitizeResult() at the bottom for the ordering contract.
 * -------------------------------------------------------------------------- */

// Canned copy shared between the upgrade-idea rewrite rules and the streetwear
// tapered-pants scrub so the two compensations stay word-for-word in sync.
const BAGGY_BALANCE_ADVICE =
  "Keep the baggy pants, but improve balance with a stronger waist detail, cleaner shoe shape, or cropped outer layer.";
const STREETWEAR_ACCESSORY_UPGRADE_TITLE = "Refine your accessory story";
const STREETWEAR_ACCESSORY_UPGRADE_DESC =
  "Make one accessory stand out more, add a stronger chain, belt detail, or crossbody bag, and keep everything intentional instead of random.";

/**
 * Step 1 — structural normalization.
 * The model can omit, mistype, or overload any field, so every score is
 * clamped (NaN-safe: NaN/missing scores become 7, confidence becomes 80),
 * every string gets a neutral default, and every list is length-capped.
 * Every later step relies on this: they assume a fully-populated
 * AnalysisResult and never re-check shape.
 */
function normalizeRawResult(data: Partial<AnalysisResult>): AnalysisResult {
  const breakdown: Partial<AnalysisResult["scoreBreakdown"]> = data.scoreBreakdown ?? {};
  const reasons: Partial<AnalysisResult["scoreReasons"]> = data.scoreReasons ?? {};
  const ideas: Partial<AnalysisResult["upgradeIdeas"][number]>[] = Array.isArray(data.upgradeIdeas)
    ? data.upgradeIdeas.slice(0, 3)
    : [];

  return {
    overallRating: clampScore(data.overallRating),
    aiConfidence: clampPercent(data.aiConfidence),
    detectedItems: {
      outerwear: String(data.detectedItems?.outerwear ?? "Not clearly visible"),
      top: String(data.detectedItems?.top ?? "Not clearly visible"),
      bottoms: String(data.detectedItems?.bottoms ?? "Not clearly visible"),
      shoes: String(data.detectedItems?.shoes ?? "Not clearly visible"),
      accessories: Array.isArray(data.detectedItems?.accessories)
        ? data.detectedItems.accessories.slice(0, 6).map(String)
        : [],
      mainColors: Array.isArray(data.detectedItems?.mainColors) ? data.detectedItems.mainColors.slice(0, 6).map(String) : [],
      silhouette: String(data.detectedItems?.silhouette ?? "Balanced everyday silhouette"),
      styleVibe: String(data.detectedItems?.styleVibe ?? "Casual")
    },
    scoreBreakdown: {
      fit: clampScore(breakdown.fit),
      colorMatching: clampScore(breakdown.colorMatching),
      shoes: clampScore(breakdown.shoes),
      accessories: clampScore(breakdown.accessories),
      occasion: clampScore(breakdown.occasion),
      trendLevel: clampScore(breakdown.trendLevel)
    },
    scoreReasons: {
      fit: String(reasons.fit ?? "Fit works overall but can be refined with proportion balance."),
      colorMatching: String(reasons.colorMatching ?? "Colors are mostly cohesive with room for stronger contrast control."),
      shoes: String(reasons.shoes ?? "Shoes support the outfit direction but could connect better to the full look."),
      accessories: String(reasons.accessories ?? "Accessory use is fine but could be more intentional."),
      occasion: String(reasons.occasion ?? "Outfit is reasonably aligned to the selected occasion."),
      trendLevel: String(reasons.trendLevel ?? "Style direction is solid with potential for sharper trend details.")
    },
    styleIdentity: String(data.styleIdentity ?? "Balanced casual style with a clean everyday direction."),
    mainFeedback: String(data.mainFeedback ?? "Solid outfit foundation with room to sharpen details."),
    colorAdvice: String(data.colorAdvice ?? "Use one accent color to improve contrast."),
    bestPart: String(data.bestPart ?? "Color and silhouette balance."),
    weakestPart: String(data.weakestPart ?? "One area needs stronger detail to look fully complete."),
    upgradeIdeas:
      ideas.length > 0
        ? ideas.map((idea) => ({
            title: String(idea.title ?? "Upgrade this area"),
            description: String(idea.description ?? "Small styling change for a cleaner result."),
            difficulty: normalizeDifficulty(idea.difficulty)
          }))
        : outputFormatExample.upgradeIdeas,
    dos: Array.isArray(data.dos) ? data.dos.slice(0, 5).map(String) : outputFormatExample.dos,
    donts: Array.isArray(data.donts) ? data.donts.slice(0, 5).map(String) : outputFormatExample.donts,
    fitCorrections: sanitizeStringList(data.fitCorrections, 3),
    stylingIdeas: sanitizeStringList(data.stylingIdeas, 3),
    styleKeywords: Array.isArray(data.styleKeywords) ? data.styleKeywords.slice(0, 8).map(String) : ["clean"],
    fashionBadges: [] // filled in by resolveFashionBadges (step 2)
  };
}

/**
 * Step 2 — fashion badges.
 * The model regularly invents badge names outside the allowed list, or omits
 * the field entirely. Whitelist what it sent; if nothing survives, infer
 * badges from style keywords and scores so the UI never renders an empty
 * badge row.
 */
function resolveFashionBadges(rawBadges: unknown, sanitized: AnalysisResult): string[] {
  const badges = sanitizeFashionBadges(rawBadges);
  if (badges.length > 0) return badges;
  return inferFashionBadges({
    styleKeywords: sanitized.styleKeywords,
    detectedItems: { styleVibe: sanitized.detectedItems.styleVibe },
    scoreBreakdown: { trendLevel: sanitized.scoreBreakdown.trendLevel, fit: sanitized.scoreBreakdown.fit }
  });
}

type OutfitContext = {
  hasHoodie: boolean;
  hasChunkySneakers: boolean;
  shoesLightColored: boolean;
  /** All accessory names joined + lowercased, for "is X already worn?" checks. */
  accBlob: string;
};

/**
 * Step 3 — outfit context.
 * Lowercased views of what the model says is physically on the body. The
 * upgrade-idea rules key off these because the main failure mode they correct
 * is the model recommending ADDING an item that detectedItems already lists.
 */
function buildOutfitContext(sanitized: AnalysisResult): OutfitContext {
  const itemText = [
    sanitized.detectedItems.outerwear,
    sanitized.detectedItems.top,
    sanitized.detectedItems.bottoms,
    sanitized.detectedItems.shoes,
    sanitized.detectedItems.accessories.join(" ")
  ]
    .join(" ")
    .toLowerCase();

  return {
    hasHoodie: itemText.includes("hoodie"),
    hasChunkySneakers: (itemText.includes("chunky") && itemText.includes("sneaker")) || itemText.includes("dad sneaker"),
    shoesLightColored: shoesAppearWhiteOrLight(sanitized.detectedItems.shoes),
    accBlob: sanitized.detectedItems.accessories.join(" ").toLowerCase()
  };
}

type UpgradeIdeaText = {
  lowerTitle: string;
  lowerDesc: string;
  /**
   * Legacy `lowerDesc + lowerTitle` blob (description first, no separator)
   * that several original regexes test against. A match can theoretically
   * straddle the desc/title seam; preserved exactly to keep behavior identical.
   */
  combined: string;
};

type UpgradeIdeaRewriteRule = {
  name: string;
  matches: (idea: UpgradeIdeaText, ctx: OutfitContext, occasion: OccasionMode) => boolean;
  rewrite: () => { title: string; description: string };
};

/**
 * Step 4 — upgrade-idea rewrites. First matching rule wins (ORDER MATTERS);
 * unmatched ideas pass through untouched. Difficulty is always preserved.
 */
const UPGRADE_IDEA_REWRITE_RULES: UpgradeIdeaRewriteRule[] = [
  {
    // WHY: the model's favorite generic tip is "add white/contrast sneakers
    // for freshness" even when the detected shoes are already white or light.
    // Redirect to shape/structure advice instead of a redundant color swap.
    name: "light-shoes-contrast-sneaker",
    matches: ({ lowerTitle, lowerDesc }, ctx) =>
      ctx.shoesLightColored &&
      (lowerDesc.includes("white sneaker") ||
        lowerDesc.includes("white trainers") ||
        lowerDesc.includes("light grey sneaker") ||
        lowerDesc.includes("light gray sneaker") ||
        lowerDesc.includes("contrast sneaker") ||
        lowerDesc.includes("brighter sneaker") ||
        lowerDesc.includes("brighten the lower") ||
        lowerDesc.includes("lighter sneaker") ||
        lowerTitle.includes("contrast sneaker")),
    rewrite: () => ({
      title: "Refine sneaker shape, not color",
      description:
        "Your sneakers already read light—focus on a cleaner profile, slightly more structured sneaker, or sharper sole line instead of reaching for extra white or high-contrast trainers."
    })
  },
  {
    // WHY: "introduce a fitted layer" is anti-streetwear boilerplate the prompt
    // explicitly bans, but the model still emits variants of it. Replace with
    // the approved cropped/structured phrasing.
    name: "fitted-layer-boilerplate",
    matches: ({ lowerTitle, lowerDesc }) =>
      lowerTitle.includes("introduce fitted") ||
      lowerDesc.includes("introduce fitted") ||
      lowerTitle.includes("fitted layer") ||
      lowerDesc.includes("fitted layer") ||
      lowerDesc.includes("fitted overshirt") ||
      lowerTitle.includes("fitted overshirt") ||
      (lowerTitle.includes("layering") && lowerDesc.includes("fitted")) ||
      (lowerDesc.includes("fitted") && lowerDesc.includes("bomber") && lowerDesc.includes("layer")),
    rewrite: () => ({
      title: "Sharpen upper-body shape",
      description: "Try a cropped jacket, structured overshirt, or shorter hoodie to improve upper-body shape."
    })
  },
  {
    // WHY: don't tell the user to add a chain they are already wearing. Ideas
    // that clearly mean "upgrade/swap the existing chain" (stronger, heavier,
    // thicker, different metal, swap) pass through untouched.
    name: "duplicate-chain",
    matches: ({ combined }, ctx) =>
      /\bchain\b|\bnecklace\b/.test(ctx.accBlob) &&
      /\b(?:add|try|introduce|wear)\s+(?:a\s+)?(?:simple\s+|silver\s+|gold\s+)?chain\b|\bsimple\s+chain\b/i.test(combined) &&
      !/\bstronger\b|\bheavier\b|\bthicker\b|\bdifferent\s+metal\b|\bswap\b/i.test(combined),
    rewrite: () => ({
      title: "Change an accessory angle",
      description:
        "You already have a chain—lean into belt detail, a crossbody bag, or a bolder chain weight instead of adding the same idea twice."
    })
  },
  {
    // WHY: same duplicate-item problem for headwear when a cap/hat/beanie is
    // already on. Swap/fit/color suggestions are legitimate and pass through.
    name: "duplicate-headwear",
    matches: ({ combined }, ctx) =>
      /\bcap\b|\bhat\b|\bbeanie\b/.test(ctx.accBlob) &&
      /(?:add|try|grab|pick up).*(cap|beanie|hat)/i.test(combined) &&
      !/(swap|switch|better\s*(fit|shape)|different\s+(color|fabric))/i.test(combined),
    rewrite: () => ({
      title: "Balance what you already have on",
      description:
        "You already committed to headwear—tighten proportions with cleaner shoe shape or a cropped structured layer instead of adding another headline piece."
    })
  },
  {
    // WHY: same duplicate-item problem for headphones; "different/sleeker/…"
    // qualifiers indicate a legitimate refinement suggestion and pass through.
    name: "duplicate-headphones",
    matches: ({ combined }, ctx) =>
      /headphones?/.test(ctx.accBlob) &&
      /headphones?/.test(combined) &&
      !/(different|sleeker|minimal|neckband|stem)/i.test(combined),
    rewrite: () => ({
      title: "Polish headphone styling",
      description:
        "Headphones already read as part of the look—instead of layering more gear, tuck cables cleaner or streamline the hoodie collar so frames sit sharper."
    })
  },
  {
    // WHY: "add a fitted outer layer" / "add a hoodie" when a hoodie is already
    // worn is duplicate layering advice; redirect to proportion refinement.
    name: "duplicate-outer-layer",
    matches: ({ lowerTitle, lowerDesc }, ctx) =>
      lowerTitle.includes("fitted outer layer") ||
      lowerDesc.includes("fitted outer layer") ||
      (ctx.hasHoodie && (lowerDesc.includes("add a hoodie") || lowerTitle.includes("add hoodie"))),
    rewrite: () => ({
      title: "Sharpen your top-layer proportions",
      description: "Try a cropped bomber, denim jacket, shorter zip hoodie, or structured overshirt to clean up proportions."
    })
  },
  {
    // WHY: don't suggest chunky sneakers when chunky sneakers are already worn.
    name: "duplicate-chunky-sneakers",
    matches: ({ lowerTitle, lowerDesc }, ctx) =>
      ctx.hasChunkySneakers && (lowerDesc.includes("chunky sneaker") || lowerTitle.includes("chunky sneaker")),
    rewrite: () => ({
      title: "Refine footwear shape",
      description: "Keep your current sneaker lane but choose a cleaner silhouette so the outfit feels less heavy."
    })
  },
  {
    // WHY: generic "simplify accessories" advice contradicts the product stance
    // that coordinated stacks are normal for casual/streetwear; steer toward
    // intentional accessory storytelling instead of removal.
    name: "simplify-accessories",
    matches: ({ lowerTitle, lowerDesc }, _ctx, occasion) =>
      (occasion === "Streetwear" || occasion === "Casual") &&
      (lowerTitle.includes("simplify accessor") ||
        lowerDesc.includes("simplify accessor") ||
        lowerTitle.includes("fewer accessor") ||
        lowerDesc.includes("fewer accessor") ||
        lowerDesc.includes("remove accessor")),
    rewrite: () => ({ title: STREETWEAR_ACCESSORY_UPGRADE_TITLE, description: STREETWEAR_ACCESSORY_UPGRADE_DESC })
  },
  {
    // WHY: "wear tapered/slim pants" is the model's default streetwear fix, but
    // intentional baggy pants are valid streetwear per the product stance;
    // replace with silhouette-balancing advice instead.
    name: "tapered-pants-for-streetwear",
    matches: ({ lowerTitle, lowerDesc }, _ctx, occasion) =>
      occasion === "Streetwear" &&
      (lowerDesc.includes("tapered pant") ||
        lowerTitle.includes("tapered pant") ||
        lowerDesc.includes("slim pant") ||
        lowerTitle.includes("slim pant") ||
        lowerDesc.includes("slimmer pant") ||
        lowerTitle.includes("slimmer pant") ||
        lowerDesc.includes("fitted pant") ||
        lowerTitle.includes("fitted pant")),
    rewrite: () => ({ title: "Balance the baggy silhouette", description: BAGGY_BALANCE_ADVICE })
  }
];

function sanitizeUpgradeIdeas(sanitized: AnalysisResult, ctx: OutfitContext, occasion: OccasionMode): void {
  sanitized.upgradeIdeas = sanitized.upgradeIdeas.map((idea) => {
    const lowerTitle = idea.title.toLowerCase();
    const lowerDesc = idea.description.toLowerCase();
    const text: UpgradeIdeaText = { lowerTitle, lowerDesc, combined: lowerDesc + lowerTitle };
    for (const rule of UPGRADE_IDEA_REWRITE_RULES) {
      if (rule.matches(text, ctx, occasion)) {
        return { ...rule.rewrite(), difficulty: idea.difficulty };
      }
    }
    return idea;
  });
}

/**
 * Step 5 — donts rewrites. Same motivation as the upgrade-idea rules: the
 * model's donts often tell casual/streetwear wearers to strip a coordinated
 * accessory stack, or use vague boilerplate. First matching rule wins.
 */
function sanitizeDonts(sanitized: AnalysisResult, occasion: OccasionMode): void {
  sanitized.donts = sanitized.donts.map((item) => {
    const lower = item.toLowerCase();

    // WHY: "mismatched color tones" is vague boilerplate; make it actionable.
    if (lower.includes("mismatched color tones")) {
      return "Avoid adding extra loud colors that fight your current palette.";
    }

    // WHY: with a small coordinated stack and no clash evidence anywhere in
    // the output, "too many accessories"-type donts would contradict the
    // accessory-score floor applied later in the pipeline; soften them to
    // "don't add MORE" instead of "remove what you have".
    if (
      (occasion === "Casual" || occasion === "Streetwear") &&
      sanitized.detectedItems.accessories.length <= 4 &&
      (hasCapChainHeadphoneTrio(sanitized.detectedItems.accessories) ||
        hasClassicStreetwearAccessoryStack(sanitized.detectedItems.accessories)) &&
      !hasAccessoryClashEvidence(
        [item, sanitized.scoreReasons.accessories, sanitized.mainFeedback, sanitized.weakestPart].join(" "),
        sanitized.detectedItems.accessories.length
      ) &&
      (lower.includes("too many accessor") ||
        lower.includes("simplify accessor") ||
        lower.includes("remove accessor") ||
        lower.includes("dial back accessor") ||
        lower.includes("less accessor"))
    ) {
      return "Avoid adding too many extra accessories.";
    }

    // WHY: when the canonical cap+chain+headphones trio is worn, standardize
    // the remaining wordy donts into short canonical phrasings. Partially
    // overlaps the rule above by design — this one also fires when clash
    // evidence exists or for non-contiguous phrasings ("too many loud
    // accessories").
    if (
      (occasion === "Casual" || occasion === "Streetwear") &&
      hasCapChainHeadphoneTrio(sanitized.detectedItems.accessories)
    ) {
      if (/bulky\b.*(?:sneaker|shoe|trainer)|(?:sneaker|shoe|trainer).*\bbulky/i.test(lower) && !/clash|\bfight\b/i.test(lower))
        return "Avoid sneakers that look too bulky for the pants.";
      if (
        /bulky.*(?:top|layer|hoodie)|heavy.*(?:hoodie|pullover|crew)|shapeless\s+(?:layer|hoodie)|(?:no|lacks?)\s+(?:clear\s+)?(?:neckline|structure|definition)/i.test(
          lower
        )
      )
        return "Avoid overly bulky top layers without structure.";
      if (/too\s+many\b.*accessor|accessor.*too\s+much|accessor.*overload|crammed\s+accessor/i.test(lower))
        return "Avoid adding too many extra accessories.";
    }
    return item;
  });
}

/**
 * Step 7 — streetwear tapered-pants scrub (prose fields).
 * The "tapered-pants-for-streetwear" rule above fixes upgrade ideas; this
 * catches the same advice leaking into mainFeedback and the fit reason.
 * NOTE: it splices a full replacement sentence into the middle of an existing
 * sentence, which can read awkwardly — preserved as-is from the original
 * implementation.
 */
function scrubTaperedPantsAdviceForStreetwear(sanitized: AnalysisResult, occasion: OccasionMode): void {
  if (occasion !== "Streetwear") return;
  sanitized.mainFeedback = sanitized.mainFeedback.replace(
    /\bslightly tapered pants?\b|\btapered pants?\b|\bslim(?:mer)? pants?\b|\bfitted pants?\b/gi,
    BAGGY_BALANCE_ADVICE
  );
  sanitized.scoreReasons.fit = sanitized.scoreReasons.fit.replace(
    /\bslightly tapered pants?\b|\btapered pants?\b|\bslim(?:mer)? pants?\b|\bfitted pants?\b/gi,
    BAGGY_BALANCE_ADVICE
  );
  sanitized.mainFeedback = sanitized.mainFeedback.replace(/\s{2,}/g, " ").trim();
  sanitized.scoreReasons.fit = sanitized.scoreReasons.fit.replace(/\s{2,}/g, " ").trim();
}

// DEAD: this can never fire. clampPercent() in normalizeRawResult() (part of
// the NaN guards added 2026-07-06) always yields a finite 0-100 number —
// missing/NaN confidence becomes 80 — so the condition below is always false
// and estimateConfidenceFromDetected() is unreachable. Kept in place during
// the 2026-07 refactor because removal is a behavior decision, not a
// structural one: a model that omits aiConfidence used to get the
// visibility-based 68/72/86 estimate and now silently gets 80. Fix or delete
// in a dedicated follow-up.
function backfillAiConfidence(sanitized: AnalysisResult): void {
  if (sanitized.aiConfidence === undefined || Number.isNaN(sanitized.aiConfidence)) {
    sanitized.aiConfidence = estimateConfidenceFromDetected(sanitized);
  }
}

/**
 * Words that mark the model's own text as praising standout styling. Without
 * one of these, streetwear fit/overall scores are capped at 8 (see
 * capStreetwearScoresForNonStandout).
 */
const STREETWEAR_STANDOUT_SIGNALS = [
  "standout",
  "unique",
  "statement",
  "polished",
  "excellent",
  "sharp",
  "intentional",
  "refined"
];

/** Warnings that make automatic score-raising unsafe — if present, skip all streetwear adjustments. */
const STREETWEAR_QUALITY_RISK_SIGNALS = [
  "messy",
  "dirty",
  "stained",
  "wrinkled",
  "clash",
  "mismatched",
  "poor quality",
  "low quality",
  "damaged"
];

/**
 * Step 8 gate — keep streetwear adjustments conservative: if the model flagged
 * real quality/matching problems anywhere in its text (or scored color
 * matching very low), trust it and skip all score raising and capping.
 */
function hasStreetwearQualityRisk(result: AnalysisResult): boolean {
  const qualityContext = [
    result.mainFeedback,
    result.colorAdvice,
    result.weakestPart,
    result.scoreReasons.colorMatching,
    result.scoreReasons.fit,
    result.scoreReasons.occasion,
    result.scoreReasons.trendLevel,
    result.styleKeywords.join(" ")
  ].join(" ");
  return hasAnySignal(qualityContext, STREETWEAR_QUALITY_RISK_SIGNALS) || result.scoreBreakdown.colorMatching <= 4;
}

function hasStandoutStylingLanguage(result: AnalysisResult): boolean {
  const standoutContext = [
    result.bestPart,
    result.mainFeedback,
    result.scoreReasons.fit,
    result.scoreReasons.trendLevel,
    result.scoreReasons.accessories
  ].join(" ");
  return hasAnySignal(standoutContext, STREETWEAR_STANDOUT_SIGNALS);
}

/**
 * WHY: the model tends to under-score "occasion match" for clearly streetwear
 * outfits even in Streetwear mode. If its own style text says the look is
 * street-adjacent, floor the occasion score at 7.
 */
function applyStreetwearOccasionFloor(result: AnalysisResult): void {
  const styleSignalText = `${result.detectedItems.styleVibe} ${result.styleKeywords.join(" ")}`;
  if (!hasAnySignal(styleSignalText, STREETWEAR_STYLE_SIGNALS)) return;
  if (result.scoreBreakdown.occasion >= 7) return;
  result.scoreBreakdown.occasion = 7;
  result.scoreReasons.occasion = `${result.scoreReasons.occasion} The outfit clearly follows a streetwear silhouette, so the occasion match should not be rated too low.`;
}

/**
 * WHY: same under-scoring problem for trendLevel; here the evidence is visual
 * (detected items) rather than the model's style text, and requires 3+
 * distinct streetwear signals before flooring.
 */
function applyStreetwearTrendFloor(result: AnalysisResult): void {
  if (countStreetwearSignals(result.detectedItems) < 3) return;
  if (result.scoreBreakdown.trendLevel >= 7) return;
  result.scoreBreakdown.trendLevel = 7;
  result.scoreReasons.trendLevel = `${result.scoreReasons.trendLevel} Multiple streetwear signals are visible, so the trend/style rating should not be too low for this mode.`;
}

/**
 * WHY: the flip side of the floors — the model also hands out 9s and 10s too
 * easily in Streetwear mode. Product calibration says good streetwear lands
 * 7.5–8.5, so unless the model's own text praises standout styling, cap fit
 * and overall at 8 (and say why in the copy).
 */
function capStreetwearScoresForNonStandout(result: AnalysisResult): void {
  if (result.scoreBreakdown.fit > 8) {
    result.scoreBreakdown.fit = 8;
    result.scoreReasons.fit = `${result.scoreReasons.fit} The silhouette works, but 9/10 fit is reserved for more polished and exceptionally intentional proportions.`;
  }
  if (result.overallRating > 8) {
    result.overallRating = 8;
    result.mainFeedback = `${result.mainFeedback} Strong everyday streetwear result, with room for one standout detail before reaching 9/10 territory.`;
  }
}

/**
 * Step 8 — streetwear score adjustments (floors + non-standout cap).
 * Only runs in Streetwear mode, and only when no quality risk was flagged.
 */
function applyStreetwearScoreAdjustments(result: AnalysisResult): void {
  if (hasStreetwearQualityRisk(result)) return;

  // Evaluate standout language BEFORE the floors append their own sentences to
  // scoreReasons — matches the original evaluation order exactly.
  const hasStandoutStyling = hasStandoutStylingLanguage(result);

  applyStreetwearOccasionFloor(result);
  applyStreetwearTrendFloor(result);
  if (!hasStandoutStyling) {
    capStreetwearScoresForNonStandout(result);
  }
}

/**
 * Post-process the raw model JSON into the final AnalysisResult.
 *
 * ORDERING CONTRACT: steps run in a fixed order because later steps read text
 * that earlier steps rewrite — e.g. the accessory-score floor (step 6b) audits
 * the rewritten donts (step 5) and the scrubbed overload phrasing (step 6a)
 * for clash evidence. Reordering these calls is a behavior change.
 */
function sanitizeResult(data: Partial<AnalysisResult>, selectedOccasion: OccasionMode): AnalysisResult {
  // Step 1: structural normalization (clamps, defaults, list caps).
  const sanitized = normalizeRawResult(data);
  // Step 2: whitelist or infer fashion badges.
  sanitized.fashionBadges = resolveFashionBadges(data.fashionBadges, sanitized);

  // Step 3: precompute what is already on the body.
  const ctx = buildOutfitContext(sanitized);
  // Steps 4-5: rewrite upgrade ideas / donts that duplicate worn items or
  // contradict the casual/streetwear product stance.
  sanitizeUpgradeIdeas(sanitized, ctx, selectedOccasion);
  sanitizeDonts(sanitized, selectedOccasion);

  // Step 6a must run before 6b: the scrub rewrites the exact text fields that
  // the accessory-score floor audits for clash evidence.
  sanitizeSoftAccessoryOverloadLabels(sanitized);
  maybeRaiseAccessoryScoreForRelaxedModes(sanitized, selectedOccasion);

  // Step 7: scrub tapered-pants advice from prose (Streetwear only).
  scrubTaperedPantsAdviceForStreetwear(sanitized, selectedOccasion);
  // Step (dead): confidence backfill — see DEAD note on backfillAiConfidence.
  backfillAiConfidence(sanitized);

  // Step 8: streetwear-only score floors and non-standout cap.
  if (selectedOccasion === "Streetwear") {
    applyStreetwearScoreAdjustments(sanitized);
  }

  return sanitized;
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
        message: "OpenAI rate limit or quota hit. Add billing/credits at platform.openai.com or wait and try again."
      };
    }
    if (msg.includes("quota") || msg.includes("billing") || msg.includes("insufficient")) {
      return {
        status: 402,
        message: "No usable OpenAI credits or billing issue. Open platform.openai.com → Billing and add a payment method or credits."
      };
    }
    return { status: 502, message: `OpenAI error: ${error.message.slice(0, 200)}` };
  }
  return { status: 500, message: "Failed to analyze image. Please try again." };
}

async function getImageDataUrl(request: Request): Promise<AnalyzeRequestPayload | NextResponse> {
  const type = request.headers.get("content-type") || "";

  if (type.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      const occasionRaw = String(formData.get("occasion") ?? "Casual");
      const occasion = OCCASIONS.includes(occasionRaw as OccasionMode) ? (occasionRaw as OccasionMode) : "Casual";
      const brutalMode = formData.get("brutalMode") === "1" || formData.get("brutalMode") === "true";
      const autoDetectOccasion = formData.get("autoDetectOccasion") === "1" || formData.get("autoDetectOccasion") === "true";
      if (!(file instanceof Blob)) {
        return jsonPayload({ error: "Missing image file (expected field name: file)." }, 400);
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return jsonPayload(
          { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Use a smaller image.` },
          400
        );
      }
      const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const base64 = Buffer.from(bytes).toString("base64");
      return {
        imageDataUrl: `data:${mime};base64,${base64}`,
        occasion,
        brutalMode,
        autoDetectOccasion
      };
    } catch (err) {
      console.error("Analyze multipart parse error:", err);
      return jsonPayload(
        { error: "Could not read the upload. Try JPG or PNG under 4 MB, or wait until the dev server finishes compiling." },
        400
      );
    }
  }

  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      occasion?: OccasionMode;
      brutalMode?: boolean;
      autoDetectOccasion?: boolean;
    };
    const imageDataUrl = body?.imageDataUrl;
    const occasion = OCCASIONS.includes(body.occasion as OccasionMode) ? (body.occasion as OccasionMode) : "Casual";
    const brutalMode = Boolean(body?.brutalMode);
    const autoDetectOccasion = Boolean(body?.autoDetectOccasion);
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonPayload({ error: "Invalid image format. Use multipart upload or a data:image/… URL." }, 400);
    }
    if (imageDataUrl.length > MAX_UPLOAD_BYTES * 2) {
      return jsonPayload({ error: "Image payload too large. Use a smaller file." }, 400);
    }
    return {
      imageDataUrl,
      occasion,
      brutalMode,
      autoDetectOccasion
    };
  } catch {
    return jsonPayload({ error: "Invalid JSON body." }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!(await checkRateLimit(`analyze:${ip}`, 12, 60, { failClosed: true })).allowed) {
      return jsonPayload({ error: "Too many requests — please wait a moment and try again." }, 429);
    }
    if (!(await checkDailyCallCap(DAILY_CALL_CAP)).allowed) {
      return jsonPayload({ error: "FitRate is handling a lot of requests right now — please try again later." }, 429);
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return jsonPayload({ error: OPENAI_API_KEY_SETUP_ERROR }, 500);
    }

    const payloadOrError = await getImageDataUrl(request);
    if (payloadOrError instanceof NextResponse) {
      return payloadOrError;
    }
    const { imageDataUrl, occasion, brutalMode, autoDetectOccasion } = payloadOrError;

    // Screen the image before it reaches the paid vision call. Fail CLOSED on
    // moderation errors: this is a safety/legal gate, and moderation shares a
    // provider with the vision call, so an outage here dooms the analysis anyway.
    const moderation = await moderateImage(apiKey, imageDataUrl);
    if (!moderation.ok) {
      if (moderation.reason === "flagged") {
        console.warn("[analyze] image rejected by moderation:", moderation.categories.join(", "));
        return jsonPayload({ error: FLAGGED_IMAGE_MESSAGE }, 422);
      }
      return jsonPayload({ error: MODERATION_UNAVAILABLE_MESSAGE }, 503);
    }

    const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
    const client = new OpenAI({
      apiKey,
      timeout: 90_000,
      maxRetries: 0
    });

    const occasionInstruction = autoDetectOccasion
      ? `No occasion was provided by the user. FIRST decide the single most appropriate occasion for this outfit, chosen from EXACTLY this list: ${OCCASIONS.join(", ")}. Then judge the outfit for THAT occasion.`
      : `You are judging the outfit for this exact occasion: "${occasion}".`;

    const prompt = `You are a premium personal stylist AI.

FIRST — before doing anything else — check whether the image contains a person wearing any type of clothing.
- ONLY reject if the image clearly has NO person wearing clothes at all: pure food photos, landscapes, objects, animals with no humans present, blank walls, text/screenshots, or abstract art.
- ALWAYS proceed if a person is visible wearing ANY type of clothing — including gym wear, sportswear, activewear, swimwear, costumes, uniforms, or any other clothing. When in doubt, proceed with analysis.
- If and ONLY if the image is clearly not a clothed human at all, return this exact JSON and nothing else:
{"error":"no_outfit","message":"No outfit detected. Please upload a photo of yourself or someone wearing clothes."}
- Otherwise proceed with the full analysis below.

${occasionInstruction}

Step 1: identify visible outfit pieces first:
- outerwear
- top
- bottoms
- shoes
- accessories
- main colors
- silhouette
- style category/vibe

You must use those detected items in your feedback and score reasons.
Mention concrete visible pieces and colors (example format: "grey oversized hoodie, black tee, navy baggy pants, white sneakers, red cap, headphones").

Global upgrade rules:
- Never recommend ADDING duplicate items already listed on the body in detectedItems (outerwear/top/bottoms/shoes/accessories) unless the guidance clearly changes STYLE, SILHOUETTE, SHAPE, COLOR, MATERIAL, or FIT.
- If detected shoes already look white, cream, beige, sail, ivory, bone, egret, or light-toned sneakers, do NOT advise adding brighter white/high-contrast trainers for "freshness"; suggest cleaner silhouette, stronger shape, nicer upper paneling, sole line, materials, OR more structured sneakers instead.

Occasion-specific logic:
- Ratings must depend on the selected occasion.
- For Casual looks: coordinated cap + chain + headphones stacks are NORMAL; treat them like relaxed street layering—don't call them "overloaded accessories" unless there are many loud/conflicting extras or clear accessory fights.
- For Streetwear: oversized and baggy fits can score high when intentional.
- For Streetwear: do NOT default to slim/fitted pants suggestions.
- For Streetwear: judge proportion balance, layering, color harmony, sneakers, accessories, and trend direction.
- For Streetwear: accessories like caps, headphones, chains, bags, and belts can score positively if they fit the vibe.
- For Streetwear: cap + chain + headphones together is common; do NOT label them "excess accessories" unless there are many loud/clashing extras or clear accessory conflict.
- For Streetwear: when accessories match the vibe, Accessories score should usually be 7/10 or higher unless they clash or look chaotic.
- Never suggest adding an accessory that is already visible in detectedItems.accessories.
- If Streetwear elements are clearly present, avoid overly harsh occasion/trend scoring.
- Avoid generic "Simplify accessories"; prefer streetwear-specific refinement: make one accessory stand out, stronger chain, belt detail, crossbody bag, keeping choices intentional rather than random.
- Do not frequently suggest tapered, slim-fit, or "slimmer pants" for Streetwear fixes; intentional baggy pants are valid—balance them with waist detail, cleaner shoe shapes, or a cropped outer layer instead.

Return ONLY valid JSON (no markdown, no extra text) with this exact shape:
${JSON.stringify({ ...outputFormatExample, detectedOccasion: occasion })}

Rules:
- detectedOccasion: REQUIRED. Exactly one value from this list — the occasion that best fits the outfit: ${OCCASIONS.join(", ")}
- overallRating and all score fields must be numbers from 1.0 to 10.0 with EXACTLY one decimal place (e.g. 7.3, 8.6, 9.1). Do NOT cluster on whole numbers or .5 values — use the decimal to express nuance between similar outfits.
- aiConfidence: optional integer 0-100 based on image clarity and outfit visibility
- include "detectedItems" with outerwear, top, bottoms, shoes, accessories[], mainColors[], silhouette, styleVibe
- styleIdentity: 1 short sentence that captures style vibe
- mainFeedback: 1-2 specific sentences with concrete observations
- colorAdvice: 1 specific sentence (practical)
- include "scoreReasons" with one specific reason for each score category
- include "bestPart" and "weakestPart" as short specific strings
- upgradeIdeas: exactly 3 ideas with title + description + difficulty (Easy/Medium/Hard)
- dos: 3 to 5 short bullet-style strings
- donts: 3 to 5 short bullet-style strings
- donts must reference actual visible pieces/problems and stay action-specific (avoid contradicting cohesive casual/street setups). Good patterns: avoiding extra unrelated accessories atop an already-balanced stack, chunky sneakers overpowering trousers, unstructured bulky tops.
- fitCorrections: 0 to 3 items, each a SHORT concrete alteration or sizing fix (max ~15 words). Only real fit problems visible in THIS photo — hem length, sleeve length, shoulder fit, taper, break over the shoe, tucking, sizing up/down. Name the specific garment. If the fit is already clean, return an empty array [] — never invent a problem. No vague style opinions, no repeating scores.
- stylingIdeas: 2 to 3 items, each a SHORT idea (max ~15 words) for restyling THIS exact outfit. MOST ideas must restyle pieces ALREADY visible — tuck, untuck, roll sleeves, layer open, flip the cap, push sleeves up, dress it up/down. At MOST ONE idea may swap a single visible piece for a different one (e.g. "swap the sneakers for boots") to shift the vibe. Must reference ACTUAL detected items by name. Do NOT pile on several new items or give generic advice that could apply to any outfit.
- styleKeywords: 4 to 7 tags
- fashionBadges: 1 to 3 strings chosen ONLY from this exact list (no other names): ${JSON.stringify([...FASHION_BADGE_IDS])}`;

    const brutalModeAddendum = brutalMode
      ? `

BRUTAL AI MODE (playful savage stylist — NOT toxic):
- Be honest, funny, slightly savage, and meme-worthy while staying respectful.
- No insults about body, weight, face, ethnicity, gender, or cruelty. No slurs.
- Use witty one-liners in mainFeedback, bestPart, weakestPart, and scoreReasons when natural.
- Examples of tone: "The fit is clean but the sneakers are fighting for attention." / "Main character jacket with NPC pants." / "This fit almost unlocked fashion enlightenment."
- Still give useful styling advice — roast the outfit, not the person.`
      : "";

    const streetwearScoringAddendum = occasion === "Streetwear"
      ? `
Streetwear scoring calibration:
- Oversized/baggy fits can score high when intentional, but do NOT auto-score 9/10.
- Reserve overall 9/10 only for standout styling, excellent proportions, unique details/pieces, strong accessories, and exceptional color coordination.
- Most good streetwear outfits should land around 7.5 to 8.5 overall.
- Fit/Silhouette should only be 9/10 when proportions are clearly polished and deliberate.
- Keep Occasion Match high when it truly matches streetwear, but keep Overall balanced and realistic.

Upgrade idea guardrails:
- Do not suggest items already present in detectedItems.
- If hoodie is already present, do not suggest adding hoodie/jacket as a basic fix; suggest proportion refinement like "Try a cropped jacket or cleaner outer layer to sharpen proportions."
- If chunky-looking sneakers are already present, do not suggest chunky sneakers again.
- Never substitute "Try slightly tapered pants"—use balancing advice instead: keep baggy pants and improve waist detail, cleaner shoe silhouette, or cropped outer layer.

Streetwear accessory & pants notes:
- Coordinated caps, chains, headphones, bags, belts are positives when they serve the vibe; penalize Accessories only for real clashes, randomness, or loud overload.
- If upgrade copy would say "Simplify accessories," rewrite it toward intentional accessory storytelling instead.
- Do NOT output "Introduce a fitted layer"—say "Try a cropped jacket, structured overshirt, or shorter hoodie to improve upper-body shape" when layers need sharpening.
- If shoes already appear light-toned per detectedItems shoes text, forbid upgrade ideas recommending white/low-contrast/high-contrast sneaker swaps for brightness; steer toward shape/structure/archetype changes only.`
      : "";

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${prompt}${brutalModeAddendum}${streetwearScoringAddendum}` },
            {
              type: "image_url",
              image_url: { url: imageDataUrl, detail: "high" }
            }
          ]
        }
      ],
      max_tokens: 900
    });

    const outputText = completion.choices[0]?.message?.content;
    if (!outputText) {
      return jsonPayload({ error: "No analysis returned from AI model." }, 502);
    }

    let parsed: Partial<AnalysisResult> & { error?: string; message?: string; detectedOccasion?: string };
    try {
      parsed = parseJsonFromModelText<Partial<AnalysisResult> & { error?: string; message?: string; detectedOccasion?: string }>(outputText);
    } catch {
      return jsonPayload({ error: "AI returned invalid JSON. Please try again." }, 502);
    }

    if (parsed.error === "no_outfit") {
      return jsonPayload({ error: parsed.error, message: parsed.message }, 422);
    }

    const detectedRaw = typeof parsed.detectedOccasion === "string" ? parsed.detectedOccasion.trim() : "";
    const detectedOccasion: OccasionMode | null = OCCASIONS.includes(detectedRaw as OccasionMode)
      ? (detectedRaw as OccasionMode)
      : null;
    // In auto mode the model judged for the occasion it detected, so sanitize against that.
    const judgeOccasion: OccasionMode = autoDetectOccasion && detectedOccasion ? detectedOccasion : occasion;

    let result: AnalysisResult;
    try {
      result = sanitizeResult(parsed, judgeOccasion);
    } catch (sanitizeErr) {
      console.error("sanitizeResult error:", sanitizeErr);
      return jsonPayload({ error: "Could not finalize analysis. Please try again." }, 502);
    }

    // Sign the finalized result so /api/save-result can verify it came from a real
    // analyze call rather than being fabricated by a client.
    const token = signResult(result);

    return jsonPayload({ result, detectedOccasion, token }, 200);
  } catch (error: unknown) {
    console.error("Analyze API error:", error);
    const { status, message } = errorMessageForUser(error);
    return jsonPayload({ error: message }, status);
  }
}
