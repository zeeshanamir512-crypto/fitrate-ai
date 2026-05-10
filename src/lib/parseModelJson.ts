/**
 * OpenAI models sometimes prepend/append commentary or use markdown fences
 * inconsistently. This extracts a JSON object from common output shapes.
 */
function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

function extractFromMarkdownFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const inner = m?.[1]?.trim();
  return inner && inner.length > 0 ? inner : null;
}

/**
 * Returns the substring from the first `{` through the matching closing `}`,
 * respecting JSON string quotes and escapes.
 */
function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function parseJsonFromModelText<T>(text: string): T {
  const trimmed = stripBom(text);
  if (!trimmed) throw new Error("Empty model output");

  const candidates: string[] = [];

  const fenced = extractFromMarkdownFence(trimmed);
  if (fenced) candidates.push(fenced);

  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) candidates.push(balanced);

  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  }

  for (const raw of candidates) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // try next strategy
    }
  }

  throw new Error("Could not parse JSON from model output");
}
