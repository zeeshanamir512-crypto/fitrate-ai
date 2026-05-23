export type Difficulty = "Easy" | "Medium" | "Hard";

export type AnalysisResult = {
  overallRating: number;
  aiConfidence?: number;
  detectedItems: {
    outerwear: string;
    top: string;
    bottoms: string;
    shoes: string;
    accessories: string[];
    mainColors: string[];
    silhouette: string;
    styleVibe: string;
  };
  scoreBreakdown: {
    fit: number;
    colorMatching: number;
    shoes: number;
    accessories: number;
    occasion: number;
    trendLevel: number;
  };
  scoreReasons: {
    fit: string;
    colorMatching: string;
    shoes: string;
    accessories: string;
    occasion: string;
    trendLevel: string;
  };
  styleIdentity: string;
  mainFeedback: string;
  colorAdvice: string;
  bestPart: string;
  weakestPart: string;
  upgradeIdeas: { title: string; description: string; difficulty: Difficulty }[];
  dos: string[];
  donts: string[];
  styleKeywords: string[];
  fashionBadges: string[];
};

export const SCORE_BREAKDOWN_KEYS = [
  { key: "fit" as const, label: "Fit / Silhouette" },
  { key: "colorMatching" as const, label: "Color Matching" },
  { key: "shoes" as const, label: "Shoes Match" },
  { key: "accessories" as const, label: "Accessories" },
  { key: "occasion" as const, label: "Occasion Match" },
  { key: "trendLevel" as const, label: "Trend / Style Level" }
];
