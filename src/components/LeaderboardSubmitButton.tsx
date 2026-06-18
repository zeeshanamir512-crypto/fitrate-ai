"use client";

import { useEffect, useState } from "react";

const LS_KEY = "fitrate-lb-submitted";

function getSubmittedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSubmitted(id: string): void {
  try {
    const ids = getSubmittedIds();
    ids.add(id);
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function LeaderboardSubmitButton({ resultId }: { resultId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(getSubmittedIds().has(resultId));
  }, [resultId]);

  async function handleSubmit() {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/leaderboard/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId }),
      });
      if (res.ok || res.status === 409) {
        markSubmitted(resultId);
        setSubmitted(true);
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={submitting || submitted}
      className="block w-full rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/8 to-amber-500/10 px-4 py-3.5 text-center text-sm font-bold text-amber-200 ring-1 ring-amber-400/20 transition hover:border-amber-400/50 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitted ? (
        "✅ Added to this week's leaderboard"
      ) : submitting ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-200" />
          Submitting…
        </span>
      ) : (
        "🏆 Submit to Leaderboard"
      )}
    </button>
  );
}
