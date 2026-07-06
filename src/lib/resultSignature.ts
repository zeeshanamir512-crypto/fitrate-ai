import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signs analysis results so /api/save-result can prove a result actually came from a
 * real /api/analyze call, instead of trusting arbitrary client-posted JSON (which let
 * anyone forge public /r/[id] pages and leaderboard entries with fake scores/text).
 *
 * Secret precedence: RESULT_SIGNING_SECRET, else OPENAI_API_KEY (always present
 * server-side, never sent to the client) so this needs zero extra config to work.
 */
function getSigningSecret(): string | null {
  return process.env.RESULT_SIGNING_SECRET?.trim() || process.env.OPENAI_API_KEY?.trim() || null;
}

/**
 * Deterministic JSON: recursively sorts object keys so that the string signed at
 * analyze time matches the string verified at save time, regardless of how the value
 * was parsed/re-serialized on its round-trip through the client.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

/** Returns an HMAC token for a result, or null if no secret is configured. */
export function signResult(result: unknown): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(canonicalize(result)).digest("hex");
}

/** Constant-time verification that `token` was issued for exactly this `result`. */
export function verifyResultToken(result: unknown, token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = signResult(result);
  if (!expected) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
