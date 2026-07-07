"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-link battle entry point on /r/[id]: creates an OPEN battle from this
 * result and navigates straight to its shareable page (replaces the old
 * paste-two-URLs /battle/new flow).
 */
export function StartBattleButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/battle/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idA: resultId }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not create the battle. Please try again.");
        return;
      }
      router.push(`/battle/${data.id}`);
    } catch {
      setError("Could not create the battle. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="block w-full rounded-xl border border-violet-400/30 bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-violet-600/15 px-4 py-3.5 text-center text-sm font-bold text-violet-200 ring-1 ring-violet-400/20 transition hover:border-violet-400/50 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200" />
            Creating battle…
          </span>
        ) : (
          "⚔ Start a Battle"
        )}
      </button>
      {error && <p className="mt-2 text-center text-xs text-rose-300">{error}</p>}
    </div>
  );
}
