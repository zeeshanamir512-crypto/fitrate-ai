import OpenAI from "openai";

/**
 * Image moderation via OpenAI's free omni-moderation endpoint. Runs BEFORE the paid
 * gpt-4o vision call in analyze/compare (so flagged images never reach it), and on
 * thumbnails in save-result (the only user image that actually becomes public).
 *
 * Verdicts:
 *  - { ok: true }                  — image passed
 *  - { ok: false, reason: "flagged" } — endpoint flagged it (sexual content, violence,
 *    gore, self-harm, and any other category the model supports); category names are
 *    in `categories` for server-side logging only — never echo them to users.
 *  - { ok: false, reason: "error" }   — the moderation call itself failed. Callers on
 *    the analyze/compare path should FAIL CLOSED (reject): this is a legal/safety
 *    gate, and since moderation and vision share a provider, an outage here means the
 *    vision call was about to fail anyway.
 */
export type ModerationVerdict =
  | { ok: true }
  | { ok: false; reason: "flagged"; categories: string[] }
  | { ok: false; reason: "error" };

const MODERATION_TIMEOUT_MS = 10_000;

export const FLAGGED_IMAGE_MESSAGE = "This image can't be processed. Please upload an appropriate outfit photo.";
export const MODERATION_UNAVAILABLE_MESSAGE = "Image screening is temporarily unavailable. Please try again in a moment.";

export async function moderateImage(apiKey: string, imageDataUrl: string): Promise<ModerationVerdict> {
  try {
    const client = new OpenAI({ apiKey, timeout: MODERATION_TIMEOUT_MS, maxRetries: 1 });
    const response = await client.moderations.create({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: imageDataUrl } }],
    });

    const result = response.results[0];
    if (!result) return { ok: false, reason: "error" };

    if (result.flagged) {
      const categories = Object.entries(result.categories)
        .filter(([, hit]) => hit === true)
        .map(([name]) => name);
      return { ok: false, reason: "flagged", categories };
    }
    return { ok: true };
  } catch (err) {
    console.error("[moderation] image check failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "error" };
  }
}
