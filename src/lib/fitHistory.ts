export type FitHistoryEntry = {
  id: string;
  date: string;
  score: number;
  occasion: string;
  badges: string[];
  styleIdentity: string;
  thumbnail: string | null;
  /**
   * Compare-mode fields (all optional so pre-existing single-mode entries still parse).
   * When kind === "compare", `score` holds Outfit A's score and these carry the rest.
   */
  kind?: "single" | "compare";
  scoreB?: number;
  thumbnailB?: string | null;
  winner?: "A" | "B" | "Tie";
};

const STORAGE_KEY = "fitrate-history";
const MAX_ENTRIES = 5;

export function loadFitHistory(): FitHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FitHistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as Record<string, unknown>).id === "string" &&
        typeof (e as Record<string, unknown>).score === "number"
    );
  } catch {
    return [];
  }
}

export function saveFitHistory(entries: FitHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage may be full or unavailable
  }
}

export function addToFitHistory(
  history: FitHistoryEntry[],
  entry: Omit<FitHistoryEntry, "id" | "date">
): FitHistoryEntry[] {
  const newEntry: FitHistoryEntry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...entry,
  };
  return [newEntry, ...history].slice(0, MAX_ENTRIES);
}

export async function makeThumbnail(dataUrl: string): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("no 2d ctx")); return; }
        const ratio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ratio > 1) { sw = img.height; sx = (img.width - sw) / 2; }
        else { sh = img.width; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}
