import OpenAI from "openai";
import { NextResponse } from "next/server";

import { FASHION_BADGE_IDS, inferFashionBadges, sanitizeFashionBadges } from "@/lib/fashionBadges";
import { jsonPayload } from "@/lib/jsonResponse";
import { getOpenAiApiKey, OPENAI_API_KEY_SETUP_ERROR } from "@/lib/openaiApiKey";
import { parseJsonFromModelText } from "@/lib/parseModelJson";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { AnalysisResult, Difficulty } from "@/types/analysis";

export const maxDuration = 120;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OccasionMode = "Casual" | "School" | "Date" | "Gym" | "Party" | "Streetwear" | "Smart casual" | "Business" | "Festival" | "Beach";

type AnalyzeRequestPayload = {
  imageDataUrl: string;
  occasion: OccasionMode;
  brutalMode: boolean;
};

const outputFormatExample: AnalysisResult = {
  overallRating: 8,
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
    fit: 8,
    colorMatching: 7,
    shoes: 7,
    accessories: 7,
    occasion: 8,
    trendLevel: 7
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
  styleKeywords: ["smart casual", "minimal", "clean", "balanced"],
  fashionBadges: ["Clean Minimalist", "Streetwear King"]
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // keep requests small and fast
const OCCASIONS: OccasionMode[] = ["Casual", "School", "Date", "Gym", "Party", "Streetwear", "Smart casual", "Business", "Festival", "Beach"];

function clampScore(value: unknown): number {
  return Math.min(10, Math.max(1, Number(value ?? 7)));
}

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, Number(value ?? 80)));
}

function normalizeDifficulty(value: unknown): Difficulty {
  if (value === "Easy" || value === "Medium" || value === "Hard") return value;
  return "Easy";
}

function hasAnySignal(text: string, signals: string[]): boolean {
  const lower = text.toLowerCase();
  return signals.some((signal) => lower.includes(signal));
}

function matchesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

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

function hasCapChainHeadphoneTrio(accessories: string[]): boolean {
  if (accessories.length === 0) return false;
  const blob = accessories.map((a) => a.toLowerCase()).join(" ");
  const hasHead = /\b(cap|snapback|trucker hat|dad hat|baseball hat|fitted hat)\b|\bbeanie\b/.test(blob);
  const hasChain = /\b(chain|necklace)\b/.test(blob);
  const hasPhones = /\b(headphones?|earbuds?)\b|\bbeats\b/i.test(blob);
  return hasHead && hasChain && hasPhones && accessories.length <= 4;
}

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
  const looksLight = lightHints.some((w) => shoeLower.includes(w)) || /\btriple white\b|\b(all white)\b/i.test(shoeLower);
  const lightGreySneakers =
    /\b(sneaker|trainer|footwear)\b/.test(shoeLower) &&
    /\b(light|silver|dust|cloud|ash|steel)\b/.test(shoeLower) &&
    /\b(grey|gray)\b/.test(shoeLower);

  if (!(looksLight || lightGreySneakers)) return false;
  if (looksDarkFootwear) return false;
  return true;
}

function sanitizeSoftAccessoryOverloadLabels(result: AnalysisResult): void {
  if (!hasCapChainHeadphoneTrio(result.detectedItems.accessories)) return;

  const scrubOverload = (text: string): string =>
    text
      .replace(/\boverloaded with accessories\b/gi, "not overloaded across accessories")
      .replace(/\baccessory overload\b/gi, "a coordinated trio")
      .replace(/\bover[- ]accessorized\b/gi, "accessorized intentionally")
      .replace(/\bcrowded accessor\b/gi, "accessor details")
      .replace(/\s{2,}/g, " ")
      .trim();

  result.scoreReasons.accessories = scrubOverload(result.scoreReasons.accessories);
  result.mainFeedback = scrubOverload(result.mainFeedback);
  result.weakestPart = scrubOverload(result.weakestPart);
}

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
  const streetSignals = ["streetwear", "oversized", "baggy", "relaxed", "casual", "skater", "urban", "layered", "sporty"];
  const hasStreetStyleHint = hasAnySignal(styleSignalText, streetSignals);
  const streetStack =
    occasion === "Streetwear" &&
    hasClassicStreetwearAccessoryStack(acc) &&
    n <= 5 &&
    (hasStreetStyleHint || countStreetwearSignals(result.detectedItems) >= 2);

  if (!trioMatch && !streetStack) return;

  result.scoreBreakdown.accessories = 7;
  result.scoreReasons.accessories = `${result.scoreReasons.accessories} Coordinated cap + chain + headphones-type stacks read normal for casual/streetwear unless something clashes.`;
}

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

function countStreetwearSignals(detected: AnalysisResult["detectedItems"]): number {
  let count = 0;
  const checks = [
    `${detected.outerwear} ${detected.top}`,
    detected.bottoms,
    detected.shoes,
    detected.silhouette,
    detected.accessories.join(" ")
  ].map((value) => value.toLowerCase());

  if (checks.some((value) => value.includes("oversized hoodie") || (value.includes("hoodie") && value.includes("oversized")))) count += 1;
  if (checks.some((value) => value.includes("baggy pants") || value.includes("baggy") || value.includes("cargo"))) count += 1;
  if (checks.some((value) => value.includes("cap"))) count += 1;
  if (checks.some((value) => value.includes("headphones"))) count += 1;
  if (checks.some((value) => value.includes("sneakers") || value.includes("trainer"))) count += 1;
  if (checks.some((value) => value.includes("layered") || value.includes("over") || value.includes("overshirt"))) count += 1;
  if (checks.some((value) => value.includes("loose silhouette") || (value.includes("loose") && value.includes("silhouette")))) count += 1;

  return count;
}

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

function sanitizeResult(data: Partial<AnalysisResult>, selectedOccasion: OccasionMode): AnalysisResult {
  const breakdown: Partial<AnalysisResult["scoreBreakdown"]> = data.scoreBreakdown ?? {};
  const reasons: Partial<AnalysisResult["scoreReasons"]> = data.scoreReasons ?? {};
  const ideas: Partial<AnalysisResult["upgradeIdeas"][number]>[] = Array.isArray(data.upgradeIdeas)
    ? data.upgradeIdeas.slice(0, 3)
    : [];

  const sanitized: AnalysisResult = {
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
    styleKeywords: Array.isArray(data.styleKeywords) ? data.styleKeywords.slice(0, 8).map(String) : ["clean"],
    fashionBadges: []
  };

  let badges = sanitizeFashionBadges(data.fashionBadges);
  if (badges.length === 0) {
    badges = inferFashionBadges({
      styleKeywords: sanitized.styleKeywords,
      detectedItems: { styleVibe: sanitized.detectedItems.styleVibe },
      scoreBreakdown: { trendLevel: sanitized.scoreBreakdown.trendLevel, fit: sanitized.scoreBreakdown.fit }
    });
  }
  sanitized.fashionBadges = badges;

  // Make upgrades/don'ts more outfit-aware and less generic.
  const itemText = [
    sanitized.detectedItems.outerwear,
    sanitized.detectedItems.top,
    sanitized.detectedItems.bottoms,
    sanitized.detectedItems.shoes,
    sanitized.detectedItems.accessories.join(" ")
  ]
    .join(" ")
    .toLowerCase();
  const hasHoodie = itemText.includes("hoodie");
  const hasChunkySneakers = (itemText.includes("chunky") && itemText.includes("sneaker")) || itemText.includes("dad sneaker");
  const shoesLightColored = shoesAppearWhiteOrLight(sanitized.detectedItems.shoes);
  const accBlob = sanitized.detectedItems.accessories.join(" ").toLowerCase();

  const baggyBalanceAdvice =
    "Keep the baggy pants, but improve balance with a stronger waist detail, cleaner shoe shape, or cropped outer layer.";
  const streetwearAccessoryUpgradeTitle = "Refine your accessory story";
  const streetwearAccessoryUpgradeDesc =
    "Make one accessory stand out more, add a stronger chain, belt detail, or crossbody bag, and keep everything intentional instead of random.";

  sanitized.upgradeIdeas = sanitized.upgradeIdeas.map((idea) => {
    const lowerTitle = idea.title.toLowerCase();
    const lowerDesc = idea.description.toLowerCase();

    const suggestsContrastLightSneakers =
      lowerDesc.includes("white sneaker") ||
      lowerDesc.includes("white trainers") ||
      lowerDesc.includes("light grey sneaker") ||
      lowerDesc.includes("light gray sneaker") ||
      lowerDesc.includes("contrast sneaker") ||
      lowerDesc.includes("brighter sneaker") ||
      lowerDesc.includes("brighten the lower") ||
      lowerDesc.includes("lighter sneaker") ||
      lowerTitle.includes("contrast sneaker");

    if (shoesLightColored && suggestsContrastLightSneakers) {
      return {
        title: "Refine sneaker shape, not color",
        description:
          "Your sneakers already read light—focus on a cleaner profile, slightly more structured sneaker, or sharper sole line instead of reaching for extra white or high-contrast trainers.",
        difficulty: idea.difficulty
      };
    }

    if (
      lowerTitle.includes("introduce fitted") ||
      lowerDesc.includes("introduce fitted") ||
      lowerTitle.includes("fitted layer") ||
      lowerDesc.includes("fitted layer") ||
      lowerDesc.includes("fitted overshirt") ||
      lowerTitle.includes("fitted overshirt") ||
      (lowerTitle.includes("layering") && lowerDesc.includes("fitted")) ||
      (lowerDesc.includes("fitted") && lowerDesc.includes("bomber") && lowerDesc.includes("layer"))
    ) {
      return {
        title: "Sharpen upper-body shape",
        description: "Try a cropped jacket, structured overshirt, or shorter hoodie to improve upper-body shape.",
        difficulty: idea.difficulty
      };
    }

    if (
      /\bchain\b|\bnecklace\b/.test(accBlob) &&
      /\b(?:add|try|introduce|wear)\s+(?:a\s+)?(?:simple\s+|silver\s+|gold\s+)?chain\b|\bsimple\s+chain\b/i.test(lowerDesc + lowerTitle) &&
      !/\bstronger\b|\bheavier\b|\bthicker\b|\bdifferent\s+metal\b|\bswap\b/i.test(lowerDesc + lowerTitle)
    ) {
      return {
        title: "Change an accessory angle",
        description:
          "You already have a chain—lean into belt detail, a crossbody bag, or a bolder chain weight instead of adding the same idea twice.",
        difficulty: idea.difficulty
      };
    }

    if (
      /\bcap\b|\bhat\b|\bbeanie\b/.test(accBlob) &&
      /(?:add|try|grab|pick up).*(cap|beanie|hat)/i.test(lowerDesc + lowerTitle) &&
      !/(swap|switch|better\s*(fit|shape)|different\s+(color|fabric))/i.test(lowerDesc + lowerTitle)
    ) {
      return {
        title: "Balance what you already have on",
        description:
          "You already committed to headwear—tighten proportions with cleaner shoe shape or a cropped structured layer instead of adding another headline piece.",
        difficulty: idea.difficulty
      };
    }

    if (
      /headphones?/.test(accBlob) &&
      /headphones?/.test(lowerDesc + lowerTitle) &&
      !/(different|sleeker|minimal|neckband|stem)/i.test(lowerDesc + lowerTitle)
    ) {
      return {
        title: "Polish headphone styling",
        description:
          "Headphones already read as part of the look—instead of layering more gear, tuck cables cleaner or streamline the hoodie collar so frames sit sharper.",
        difficulty: idea.difficulty
      };
    }

    if (
      lowerTitle.includes("fitted outer layer") ||
      lowerDesc.includes("fitted outer layer") ||
      (hasHoodie && (lowerDesc.includes("add a hoodie") || lowerTitle.includes("add hoodie")))
    ) {
      return {
        title: "Sharpen your top-layer proportions",
        description: "Try a cropped bomber, denim jacket, shorter zip hoodie, or structured overshirt to clean up proportions.",
        difficulty: idea.difficulty
      };
    }
    if (hasChunkySneakers && (lowerDesc.includes("chunky sneaker") || lowerTitle.includes("chunky sneaker"))) {
      return {
        title: "Refine footwear shape",
        description: "Keep your current sneaker lane but choose a cleaner silhouette so the outfit feels less heavy.",
        difficulty: idea.difficulty
      };
    }
    if (
      (selectedOccasion === "Streetwear" || selectedOccasion === "Casual") &&
      (lowerTitle.includes("simplify accessor") ||
        lowerDesc.includes("simplify accessor") ||
        lowerTitle.includes("fewer accessor") ||
        lowerDesc.includes("fewer accessor") ||
        lowerDesc.includes("remove accessor"))
    ) {
      return {
        title: streetwearAccessoryUpgradeTitle,
        description: streetwearAccessoryUpgradeDesc,
        difficulty: idea.difficulty
      };
    }
    if (
      selectedOccasion === "Streetwear" &&
      (lowerDesc.includes("tapered pant") ||
        lowerTitle.includes("tapered pant") ||
        lowerDesc.includes("slim pant") ||
        lowerTitle.includes("slim pant") ||
        lowerDesc.includes("slimmer pant") ||
        lowerTitle.includes("slimmer pant") ||
        lowerDesc.includes("fitted pant") ||
        lowerTitle.includes("fitted pant"))
    ) {
      return {
        title: "Balance the baggy silhouette",
        description: baggyBalanceAdvice,
        difficulty: idea.difficulty
      };
    }
    return idea;
  });

  sanitized.donts = sanitized.donts.map((item) => {
    const lower = item.toLowerCase();
    if (lower.includes("mismatched color tones")) {
      return "Avoid adding extra loud colors that fight your current palette.";
    }
    if (
      (selectedOccasion === "Casual" || selectedOccasion === "Streetwear") &&
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
    if (
      (selectedOccasion === "Casual" || selectedOccasion === "Streetwear") &&
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

  sanitizeSoftAccessoryOverloadLabels(sanitized);
  maybeRaiseAccessoryScoreForRelaxedModes(sanitized, selectedOccasion);

  if (selectedOccasion === "Streetwear") {
    sanitized.mainFeedback = sanitized.mainFeedback.replace(
      /\bslightly tapered pants?\b|\btapered pants?\b|\bslim(?:mer)? pants?\b|\bfitted pants?\b/gi,
      baggyBalanceAdvice
    );
    sanitized.scoreReasons.fit = sanitized.scoreReasons.fit.replace(
      /\bslightly tapered pants?\b|\btapered pants?\b|\bslim(?:mer)? pants?\b|\bfitted pants?\b/gi,
      baggyBalanceAdvice
    );
    sanitized.mainFeedback = sanitized.mainFeedback.replace(/\s{2,}/g, " ").trim();
    sanitized.scoreReasons.fit = sanitized.scoreReasons.fit.replace(/\s{2,}/g, " ").trim();
  }
  if (sanitized.aiConfidence === undefined || Number.isNaN(sanitized.aiConfidence)) {
    sanitized.aiConfidence = estimateConfidenceFromDetected(sanitized);
  }

  if (selectedOccasion !== "Streetwear") {
    return sanitized;
  }

  const streetwearSignals = ["streetwear", "oversized", "baggy", "relaxed", "casual", "skater", "urban", "layered", "sporty"];
  const standoutSignals = ["standout", "unique", "statement", "polished", "excellent", "sharp", "intentional", "refined"];
  const qualityRiskSignals = [
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

  const qualityContext = [
    sanitized.mainFeedback,
    sanitized.colorAdvice,
    sanitized.weakestPart,
    sanitized.scoreReasons.colorMatching,
    sanitized.scoreReasons.fit,
    sanitized.scoreReasons.occasion,
    sanitized.scoreReasons.trendLevel,
    sanitized.styleKeywords.join(" ")
  ].join(" ");

  // Keep adjustments conservative: skip if quality/matching warnings are present.
  const hasQualityRisk = hasAnySignal(qualityContext, qualityRiskSignals) || sanitized.scoreBreakdown.colorMatching <= 4;
  if (hasQualityRisk) {
    return sanitized;
  }

  const styleSignalText = `${sanitized.detectedItems.styleVibe} ${sanitized.styleKeywords.join(" ")}`;
  const hasStreetwearSignal = hasAnySignal(styleSignalText, streetwearSignals);
  const visualStreetwearSignals = countStreetwearSignals(sanitized.detectedItems);
  const standoutContext = [
    sanitized.bestPart,
    sanitized.mainFeedback,
    sanitized.scoreReasons.fit,
    sanitized.scoreReasons.trendLevel,
    sanitized.scoreReasons.accessories
  ].join(" ");
  const hasStandoutStyling = hasAnySignal(standoutContext, standoutSignals);

  if (hasStreetwearSignal && sanitized.scoreBreakdown.occasion < 7) {
    sanitized.scoreBreakdown.occasion = 7;
    sanitized.scoreReasons.occasion = `${sanitized.scoreReasons.occasion} The outfit clearly follows a streetwear silhouette, so the occasion match should not be rated too low.`;
  }

  if (visualStreetwearSignals >= 3 && sanitized.scoreBreakdown.trendLevel < 7) {
    sanitized.scoreBreakdown.trendLevel = 7;
    sanitized.scoreReasons.trendLevel = `${sanitized.scoreReasons.trendLevel} Multiple streetwear signals are visible, so the trend/style rating should not be too low for this mode.`;
  }

  // Keep Streetwear scoring realistic: good outfits are usually 7.5-8.5 unless clearly standout.
  if (!hasStandoutStyling) {
    if (sanitized.scoreBreakdown.fit > 8) {
      sanitized.scoreBreakdown.fit = 8;
      sanitized.scoreReasons.fit = `${sanitized.scoreReasons.fit} The silhouette works, but 9/10 fit is reserved for more polished and exceptionally intentional proportions.`;
    }
    if (sanitized.overallRating > 8) {
      sanitized.overallRating = 8;
      sanitized.mainFeedback = `${sanitized.mainFeedback} Strong everyday streetwear result, with room for one standout detail before reaching 9/10 territory.`;
    }
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
        brutalMode
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
    };
    const imageDataUrl = body?.imageDataUrl;
    const occasion = OCCASIONS.includes(body.occasion as OccasionMode) ? (body.occasion as OccasionMode) : "Casual";
    const brutalMode = Boolean(body?.brutalMode);
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonPayload({ error: "Invalid image format. Use multipart upload or a data:image/… URL." }, 400);
    }
    if (imageDataUrl.length > MAX_UPLOAD_BYTES * 2) {
      return jsonPayload({ error: "Image payload too large. Use a smaller file." }, 400);
    }
    return {
      imageDataUrl,
      occasion,
      brutalMode
    };
  } catch {
    return jsonPayload({ error: "Invalid JSON body." }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit(ip, 12).allowed) {
      return jsonPayload({ error: "Too many requests — please wait a moment and try again." }, 429);
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return jsonPayload({ error: OPENAI_API_KEY_SETUP_ERROR }, 500);
    }

    const payloadOrError = await getImageDataUrl(request);
    if (payloadOrError instanceof NextResponse) {
      return payloadOrError;
    }
    const { imageDataUrl, occasion, brutalMode } = payloadOrError;

    const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
    const client = new OpenAI({
      apiKey,
      timeout: 90_000,
      maxRetries: 0
    });

    const prompt = `You are a premium personal stylist AI.

FIRST — before doing anything else — check whether the image contains a person wearing any type of clothing.
- ONLY reject if the image clearly has NO person wearing clothes at all: pure food photos, landscapes, objects, animals with no humans present, blank walls, text/screenshots, or abstract art.
- ALWAYS proceed if a person is visible wearing ANY type of clothing — including gym wear, sportswear, activewear, swimwear, costumes, uniforms, or any other clothing. When in doubt, proceed with analysis.
- If and ONLY if the image is clearly not a clothed human at all, return this exact JSON and nothing else:
{"error":"no_outfit","message":"No outfit detected. Please upload a photo of yourself or someone wearing clothes."}
- Otherwise proceed with the full analysis below.

You are judging the outfit for this exact occasion: "${occasion}".

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
${JSON.stringify(outputFormatExample)}

Rules:
- overallRating and all score fields must be integers 1 to 10
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
              image_url: { url: imageDataUrl, detail: "low" }
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

    let parsed: Partial<AnalysisResult> & { error?: string; message?: string };
    try {
      parsed = parseJsonFromModelText<Partial<AnalysisResult> & { error?: string; message?: string }>(outputText);
    } catch {
      return jsonPayload({ error: "AI returned invalid JSON. Please try again." }, 502);
    }

    if (parsed.error === "no_outfit") {
      return jsonPayload({ error: parsed.error, message: parsed.message }, 422);
    }

    let result: AnalysisResult;
    try {
      result = sanitizeResult(parsed, occasion);
    } catch (sanitizeErr) {
      console.error("sanitizeResult error:", sanitizeErr);
      return jsonPayload({ error: "Could not finalize analysis. Please try again." }, 502);
    }

    return jsonPayload({ result }, 200);
  } catch (error: unknown) {
    console.error("Analyze API error:", error);
    const { status, message } = errorMessageForUser(error);
    return jsonPayload({ error: message }, status);
  }
}
