import Link from "next/link";
import type { Metadata } from "next";
import { getLeaderboard, getWeekLabel } from "@/lib/leaderboardStore";
import type { LeaderboardEntry } from "@/lib/leaderboardStore";
import { formatScore } from "@/lib/formatScore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly Leaderboard | FitRate AI",
  description: "The top-rated outfits this week, ranked by AI score.",
};

function rankDisplay(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6) return "text-indigo-300";
  return "text-amber-400";
}

function EntryCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const isMedal = rank <= 3;
  return (
    <Link
      href={`/r/${entry.id}`}
      className={`group flex items-center gap-4 rounded-2xl border bg-slate-950/60 p-4 ring-1 backdrop-blur-md transition duration-200 hover:-translate-y-0.5 sm:gap-5 sm:p-5 ${
        rank === 1
          ? "border-amber-400/35 shadow-[0_0_32px_-8px_rgba(251,191,36,0.3)] ring-amber-400/20"
          : rank === 2
            ? "border-slate-400/25 ring-slate-400/10"
            : rank === 3
              ? "border-amber-700/30 ring-amber-700/10"
              : "border-white/[0.07] ring-white/[0.04] hover:border-indigo-400/25"
      }`}
    >
      {/* Rank */}
      <div className="flex w-10 shrink-0 items-center justify-center">
        {isMedal ? (
          <span className="text-2xl leading-none">{rankDisplay(rank)}</span>
        ) : (
          <span className="text-sm font-bold tabular-nums text-slate-500">{rankDisplay(rank)}</span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-800/60 sm:h-16 sm:w-16">
        {entry.thumbnailUrl ? (
          <img
            src={entry.thumbnailUrl}
            alt="Outfit"
            className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">👕</div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-snug text-white group-hover:text-indigo-200">
          {entry.styleIdentity}
        </p>
        <span className="mt-1.5 inline-block rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
          {entry.occasion}
        </span>
      </div>

      {/* Score */}
      <div className="shrink-0 text-right">
        <p className={`text-2xl font-extrabold tabular-nums leading-none tracking-tight sm:text-3xl ${scoreColor(entry.score)}`}>
          {formatScore(entry.score)}
        </p>
        <p className="mt-0.5 text-[10px] font-medium text-slate-500">/10</p>
      </div>

      {/* Arrow */}
      <div className="shrink-0 text-slate-600 transition group-hover:text-indigo-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}

export default async function LeaderboardPage() {
  const [entries, weekLabel] = await Promise.all([getLeaderboard(), Promise.resolve(getWeekLabel())]);

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-12 sm:py-16">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[520px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute -left-32 bottom-0 h-[360px] w-[500px] rounded-full bg-violet-600/[0.07] blur-[110px]" />
        <div className="absolute -right-24 top-1/3 h-[300px] w-[420px] rounded-full bg-cyan-500/[0.06] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-2xl">
        {/* Brand */}
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-400/70 transition hover:text-indigo-300"
          >
            FitRate AI
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-400/60">
            Weekly Rankings
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            This Week&rsquo;s Top Fits
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Week of{" "}
            <span className="font-semibold text-indigo-300">{weekLabel}</span>
            {" · "}Resets every Monday
          </p>
        </div>

        {/* List */}
        {entries.length === 0 ? (
          <div className="rounded-3xl border border-white/[0.07] bg-slate-950/60 px-6 py-16 text-center ring-1 ring-white/[0.04]">
            <p className="text-4xl">🏆</p>
            <p className="mt-4 text-base font-semibold text-white">No fits submitted yet this week</p>
            <p className="mt-2 text-sm text-slate-400">Be the first to make it on the board.</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_40px_-8px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98]"
            >
              Rate your fit →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} rank={i + 1} />
            ))}
          </div>
        )}

        {/* CTA */}
        {entries.length > 0 && (
          <div className="mt-10 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] px-6 py-7 text-center ring-1 ring-indigo-400/10">
            <p className="text-sm font-semibold text-white">Think you can crack the top 10?</p>
            <p className="mt-1 text-xs text-slate-400">Get your outfit rated and submit to the leaderboard.</p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_40px_-8px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98]"
            >
              Rate your own fit →
            </Link>
          </div>
        )}

        {/* Footer */}
        <p className="mt-10 text-center text-[11px] text-slate-600">
          Leaderboard resets each week &middot;{" "}
          <Link href="/" className="underline transition hover:text-slate-400">
            fitrate-ai.vercel.app
          </Link>
        </p>
      </div>
    </main>
  );
}
