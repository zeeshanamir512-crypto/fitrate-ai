/**
 * Single source of truth for outfit occasions. Import this everywhere instead of
 * re-declaring the list per route — a drift here previously let /api/compare
 * silently fall back to "Casual" for Business/Festival/Beach.
 */
export const OCCASIONS = [
  "Casual",
  "School",
  "Date",
  "Gym",
  "Party",
  "Streetwear",
  "Smart casual",
  "Business",
  "Festival",
  "Beach",
] as const;

export type OccasionMode = (typeof OCCASIONS)[number];

export function isOccasion(value: unknown): value is OccasionMode {
  return typeof value === "string" && (OCCASIONS as readonly string[]).includes(value);
}
