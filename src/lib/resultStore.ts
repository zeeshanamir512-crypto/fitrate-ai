import { kv } from "@vercel/kv";
import type { AnalysisResult } from "@/types/analysis";

export type SharedResult = {
  id: string;
  createdAt: string;
  occasion: string;
  result: AnalysisResult;
};

const TTL_SECONDS = 30 * 24 * 60 * 60;

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveSharedResult(
  data: Omit<SharedResult, "id" | "createdAt">
): Promise<string | null> {
  if (!isKvConfigured()) return null;
  try {
    const id = generateId();
    const entry: SharedResult = { ...data, id, createdAt: new Date().toISOString() };
    await kv.set(`result:${id}`, entry, { ex: TTL_SECONDS });
    return id;
  } catch {
    return null;
  }
}

export async function getSharedResult(id: string): Promise<SharedResult | null> {
  if (!isKvConfigured()) return null;
  try {
    return await kv.get<SharedResult>(`result:${id}`);
  } catch {
    return null;
  }
}
