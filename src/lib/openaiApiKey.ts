/**
 * Resolves OpenAI API key from server env (.env.local must be UTF-8, not UTF-16).
 */
export function getOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (isPlaceholderOpenAiApiKey(apiKey)) return null;
  return apiKey;
}

export function isPlaceholderOpenAiApiKey(apiKey: string): boolean {
  if (apiKey === "your_openai_api_key_here") return true;
  if (/^your[_\s-]*openai[_\s-]*api[_\s-]*key/i.test(apiKey)) return true;
  if (/^sk-your[_\s-]*openai/i.test(apiKey)) return true;
  return false;
}

export const OPENAI_API_KEY_SETUP_ERROR =
  "Missing or placeholder OPENAI_API_KEY. Add a real key to .env.local (UTF-8 encoding, see .env.example), save, and restart npm run dev.";
