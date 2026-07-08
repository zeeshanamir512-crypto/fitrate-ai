/**
 * Shared shape for a two-outfit comparison. Extracted here so /api/compare (which
 * produces + HMAC-signs it), /api/save-compare (which verifies + stores it), the
 * compare share store, the /compare-r/[id] page, and the client all agree on one
 * definition instead of each re-declaring it and drifting apart.
 */
export type OutfitCompareResult = {
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "Tie";
  closeness: "Clear win" | "Close win" | "Tie";
  winnerReason: string;
  outfitAFeedback: string;
  outfitBFeedback: string;
  weakerOutfitTips: string[];
};
