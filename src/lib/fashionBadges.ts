export const FASHION_BADGE_IDS = [
  "Streetwear King",
  "Clean Minimalist",
  "Fashion Demon",
  "Hypebeast Energy",
  "Gym Villain",
  "Rich Vibes",
  "TikTok Fit",
  "Cozy Master",
  "Vintage Aura",
  "Cyber Drip"
] as const;

export type FashionBadgeId = (typeof FASHION_BADGE_IDS)[number];

export const BADGE_META: Record<FashionBadgeId, { icon: string; accent: string }> = {
  "Streetwear King": { icon: "👑", accent: "from-amber-400/30 to-orange-500/20 border-amber-400/45" },
  "Clean Minimalist": { icon: "✨", accent: "from-slate-300/25 to-indigo-400/15 border-slate-300/40" },
  "Fashion Demon": { icon: "😈", accent: "from-rose-500/30 to-violet-600/20 border-rose-400/50" },
  "Hypebeast Energy": { icon: "🔥", accent: "from-orange-400/30 to-rose-500/20 border-orange-400/45" },
  "Gym Villain": { icon: "💪", accent: "from-emerald-400/30 to-cyan-500/20 border-emerald-400/45" },
  "Rich Vibes": { icon: "💎", accent: "from-amber-300/25 to-violet-500/20 border-amber-300/40" },
  "TikTok Fit": { icon: "📱", accent: "from-fuchsia-400/30 to-cyan-400/20 border-fuchsia-400/45" },
  "Cozy Master": { icon: "🧸", accent: "from-amber-200/25 to-rose-400/15 border-amber-200/35" },
  "Vintage Aura": { icon: "📼", accent: "from-amber-500/25 to-rose-600/15 border-amber-500/40" },
  "Cyber Drip": { icon: "⚡", accent: "from-cyan-400/30 to-indigo-500/25 border-cyan-400/50" }
};

export function sanitizeFashionBadges(raw: unknown): FashionBadgeId[] {
  if (!Array.isArray(raw)) return [];
  const picked: FashionBadgeId[] = [];
  for (const item of raw) {
    const name = String(item).trim();
    if (FASHION_BADGE_IDS.includes(name as FashionBadgeId) && !picked.includes(name as FashionBadgeId)) {
      picked.push(name as FashionBadgeId);
    }
    if (picked.length >= 3) break;
  }
  return picked;
}

/** Client fallback when API returns no badges */
export function inferFashionBadges(result: {
  styleKeywords: string[];
  detectedItems: { styleVibe: string };
  scoreBreakdown: { trendLevel: number; fit: number };
}): FashionBadgeId[] {
  const blob = `${result.styleKeywords.join(" ")} ${result.detectedItems.styleVibe}`.toLowerCase();
  const rules: { badge: FashionBadgeId; match: RegExp }[] = [
    { badge: "Streetwear King", match: /street|urban|hype|baggy|oversized/ },
    { badge: "Clean Minimalist", match: /minimal|clean|neutral|simple/ },
    { badge: "Gym Villain", match: /gym|athletic|sport|training/ },
    { badge: "Vintage Aura", match: /vintage|retro|classic/ },
    { badge: "Cyber Drip", match: /cyber|tech|futur|neon/ },
    { badge: "Cozy Master", match: /cozy|soft|lounge|comfort/ },
    { badge: "TikTok Fit", match: /trend|tiktok|viral|y2k/ },
    { badge: "Hypebeast Energy", match: /hype|statement|bold|loud/ },
    { badge: "Rich Vibes", match: /luxury|rich|polish|smart/ }
  ];
  const found: FashionBadgeId[] = [];
  for (const { badge, match } of rules) {
    if (match.test(blob)) found.push(badge);
  }
  if (result.scoreBreakdown.trendLevel >= 8 && !found.includes("Fashion Demon")) found.push("Fashion Demon");
  if (found.length === 0) found.push("Clean Minimalist");
  return found.slice(0, 3);
}
