/**
 * Render an outfit score with exactly one decimal place (e.g. "7.3", "8.0").
 * Scores are decimals 1.0-10.0; this avoids floating-point tails like
 * "7.30000001" and keeps the decimal style consistent across every surface.
 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}
