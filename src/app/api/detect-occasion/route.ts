import OpenAI from "openai";

import { jsonPayload } from "@/lib/jsonResponse";
import { getOpenAiApiKey } from "@/lib/openaiApiKey";
import { parseJsonFromModelText } from "@/lib/parseModelJson";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const maxDuration = 15;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCCASIONS = [
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

type DetectedOccasion = (typeof OCCASIONS)[number];

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit(ip, 20).allowed) {
      return jsonPayload({ error: "rate_limit" }, 429);
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return jsonPayload({ error: "no_key" }, 500);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return jsonPayload({ error: "no_file" }, 400);
    }

    const mime = file.type?.startsWith("image/") ? file.type : "image/jpeg";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    const imageDataUrl = `data:${mime};base64,${base64}`;

    const client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this outfit photo. Return ONLY valid JSON with one key: {"occasion":"X"} where X is exactly one value from this list: ${OCCASIONS.join(", ")}. No other text, no markdown, no explanation.`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 50,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    let occasion: DetectedOccasion = "Casual";
    try {
      const parsed = parseJsonFromModelText<{ occasion?: string }>(text);
      const raw = parsed.occasion?.trim() ?? "";
      if ((OCCASIONS as readonly string[]).includes(raw)) {
        occasion = raw as DetectedOccasion;
      }
    } catch {
      // fall back to Casual
    }

    return jsonPayload({ occasion }, 200);
  } catch {
    return jsonPayload({ error: "detection_failed" }, 500);
  }
}
