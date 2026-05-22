/** Parse JSON API responses; surface HTML/error-page bodies as readable hints for the UI. */
export async function readApiJson<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const ct = response.headers.get("content-type") ?? "";

  if (!ct.includes("application/json")) {
    const raw = await response.text();
    const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    const looksLikeHtml = /<!DOCTYPE|<html[\s>]/i.test(raw);
    const compilingHint =
      looksLikeHtml || snippet.includes("Internal Server Error")
        ? " The dev server may still be compiling or the route crashed—check the terminal running npm run dev, ensure OPENAI_API_KEY is set in .env.local, then restart."
        : "";
    return {
      ok: false,
      message: `Server returned non-JSON (HTTP ${response.status}).${compilingHint}${snippet ? ` Details: ${snippet}` : ""}`
    };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, message: `Could not parse JSON (HTTP ${response.status}).` };
  }
}
