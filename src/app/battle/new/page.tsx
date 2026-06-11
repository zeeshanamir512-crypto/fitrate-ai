"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const APP_URL = "https://fitrate-ai.vercel.app";

function extractResultId(input: string): string | null {
  const trimmed = input.trim();
  // Accept a bare ID (16 hex chars)
  if (/^[0-9a-f]{16}$/i.test(trimmed)) return trimmed.toLowerCase();
  // Accept full URL like https://fitrate-ai.vercel.app/r/{id} or /r/{id}
  const match = trimmed.match(/\/r\/([0-9a-f]{16})/i);
  if (match) return match[1].toLowerCase();
  return null;
}

function BattleNewInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idA = searchParams.get("a") ?? "";

  const [opponentInput, setOpponentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const myResultUrl = idA ? `${APP_URL}/r/${idA}` : null;

  async function handleCreate() {
    const idB = extractResultId(opponentInput);
    if (!idB) {
      setError("Paste a valid FitRate result URL or ID (e.g. fitrate-ai.vercel.app/r/abc123…)");
      return;
    }
    if (idB === idA) {
      setError("You can't battle yourself — paste a different result.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/battle/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idA, idB }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Failed to create battle. Check both result URLs are valid.");
        return;
      }
      router.push(`/battle/${data.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!myResultUrl) return;
    await navigator.clipboard.writeText(myResultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!idA) {
    return (
      <div className="text-center">
        <p className="text-slate-400">No result ID provided.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-indigo-400 underline hover:text-indigo-300">
          Analyze an outfit first
        </Link>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-slate-950/80 p-6 shadow-[0_40px_100px_-24px_rgba(79,70,229,0.45)] ring-1 ring-indigo-400/20 backdrop-blur-xl sm:p-8">
      {/* Card glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -5%, rgba(99,102,241,0.18) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative space-y-6">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-indigo-400/60">
            Step 1
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Your outfit is ready</h2>
          <p className="mt-1 text-xs text-slate-400">
            Share your result link with your opponent, or paste theirs below.
          </p>
        </div>

        {/* Your result link */}
        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4 ring-1 ring-indigo-400/10">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400/60">
            Your result link
          </p>
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate rounded-lg border border-white/[0.07] bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              {myResultUrl}
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.07]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Step 2
          </p>
          <div className="h-px flex-1 bg-white/[0.07]" />
        </div>

        {/* Opponent input */}
        <div>
          <label
            htmlFor="opponent-url"
            className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            Paste opponent&apos;s result URL
          </label>
          <input
            id="opponent-url"
            type="text"
            value={opponentInput}
            onChange={(e) => {
              setOpponentInput(e.target.value);
              setError(null);
            }}
            placeholder="https://fitrate-ai.vercel.app/r/…"
            className="w-full rounded-xl border border-white/[0.1] bg-slate-950/70 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none ring-1 ring-white/[0.05] transition focus:border-indigo-400/50 focus:ring-indigo-400/20"
          />
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !opponentInput.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating battle…
            </span>
          ) : (
            "Start the Battle ⚔"
          )}
        </button>

        <Link
          href="/"
          className="block text-center text-xs text-slate-500 transition hover:text-slate-300"
        >
          Cancel — go back to FitRate AI
        </Link>
      </div>
    </div>
  );
}

export default function BattleNewPage() {
  return (
    <main className="min-h-screen bg-[#030712] px-4 py-12 sm:py-16">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-lg">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-400/70 transition hover:text-indigo-300"
          >
            FitRate AI
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Start a Battle
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Challenge someone. Let the crowd decide whose fit wins.
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-slate-500 text-sm">Loading…</div>}>
          <BattleNewInner />
        </Suspense>
      </div>
    </main>
  );
}
