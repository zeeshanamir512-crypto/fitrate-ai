"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { BattleEntry, BattleVotes } from "@/lib/battleStore";
import type { SharedResult } from "@/lib/resultStore";

type Props = {
  battle: BattleEntry;
  initialVotes: BattleVotes;
};

type VoteResult = {
  a: number;
  b: number;
  total: number;
  percentA: number;
  percentB: number;
};

const STORAGE_KEY = (id: string) => `voted_battle_${id}`;

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6) return "text-indigo-300";
  return "text-amber-400";
}

function OutfitCard({
  result,
  side,
  label,
  voted,
  winner,
  voteResult,
  onVote,
  voting,
}: {
  result: SharedResult;
  side: "a" | "b";
  label: string;
  voted: boolean;
  winner: "a" | "b" | null;
  voteResult: VoteResult | null;
  onVote: () => void;
  voting: boolean;
}) {
  const pct = voteResult
    ? side === "a"
      ? voteResult.percentA
      : voteResult.percentB
    : null;

  const isWinner = winner === side;
  const score = result.result.overallRating;
  const badges = result.result.fashionBadges ?? [];

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-3xl border transition duration-300 ${
        isWinner
          ? "border-indigo-400/50 shadow-[0_0_60px_-12px_rgba(99,102,241,0.5)] ring-1 ring-indigo-400/30"
          : voted && !isWinner
            ? "border-white/[0.06] opacity-80"
            : "border-white/[0.09] hover:border-indigo-400/25"
      } bg-slate-950/80 backdrop-blur-xl`}
    >
      {/* Card top glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(99,102,241,0.14) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      {isWinner && (
        <div className="relative flex items-center justify-center gap-1.5 border-b border-indigo-400/25 bg-indigo-500/10 py-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">
            Crowd favorite
          </span>
        </div>
      )}

      <div className="relative flex flex-1 flex-col p-5 sm:p-6">
        {/* Side label */}
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
          {label}
        </p>

        {/* Outfit photo */}
        {result.thumbnailUrl && (
          <div className="mb-4 overflow-hidden rounded-2xl">
            <img
              src={result.thumbnailUrl}
              alt={`Outfit ${label}`}
              className="h-52 w-full object-cover object-top"
            />
          </div>
        )}

        {/* Score */}
        <div className="mb-4 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-slate-950/50 to-violet-600/10 px-4 py-4 text-center ring-1 ring-indigo-400/15">
          <p className={`text-6xl font-extrabold leading-none tracking-tight tabular-nums sm:text-7xl ${scoreColor(score)}`}>
            {score}
            <span className="text-2xl font-semibold text-slate-500">/10</span>
          </p>
          <p className="mt-2 text-xs font-medium text-slate-400">
            {result.occasion}
          </p>
        </div>

        {/* Style identity */}
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-400/60">
          Style Identity
        </p>
        <p className="mb-4 text-sm font-semibold leading-snug text-white">
          {result.result.styleIdentity}
        </p>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {badges.slice(0, 3).map((badge) => (
              <span
                key={badge}
                className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-200 ring-1 ring-indigo-400/15"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* AI verdict */}
        <div className="mb-5 flex-1 rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] px-4 py-3 ring-1 ring-cyan-400/10">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/60">
            AI Verdict
          </p>
          <p className="line-clamp-4 text-xs leading-relaxed text-slate-300">
            &ldquo;{result.result.mainFeedback}&rdquo;
          </p>
        </div>

        {/* Vote area */}
        {!voted ? (
          <button
            type="button"
            onClick={onVote}
            disabled={voting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_36px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {voting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Voting…
              </span>
            ) : (
              "Vote for this outfit"
            )}
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-200">{pct}%</span>
              <span className="text-slate-500">
                {side === "a" ? voteResult?.a : voteResult?.b} votes
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BattleClient({ battle, initialVotes }: Props) {
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [winner, setWinner] = useState<"a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY(battle.id));
    if (stored) {
      const total = initialVotes.a + initialVotes.b;
      setVoted(true);
      setVoteResult({
        ...initialVotes,
        total,
        percentA: total > 0 ? Math.round((initialVotes.a / total) * 100) : 50,
        percentB: total > 0 ? Math.round((initialVotes.b / total) * 100) : 50,
      });
      setWinner(initialVotes.a >= initialVotes.b ? "a" : "b");
    }
  }, [battle.id, initialVotes]);

  async function handleVote(side: "a" | "b") {
    if (voted || voting) return;
    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`/api/battle/${battle.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      if (!res.ok) throw new Error("Vote failed");
      const data = (await res.json()) as VoteResult;
      setVoteResult(data);
      setWinner(data.a >= data.b ? "a" : "b");
      setVoted(true);
      localStorage.setItem(STORAGE_KEY(battle.id), side);
    } catch {
      setError("Couldn't record your vote. Try again.");
    } finally {
      setVoting(false);
    }
  }

  const total = voteResult?.total ?? initialVotes.a + initialVotes.b;

  return (
    <div className="space-y-8">
      {/* VS header */}
      <div className="relative flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/10 text-sm font-bold text-indigo-300 ring-1 ring-indigo-400/20">
          VS
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
      </div>

      {/* Two outfit cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OutfitCard
          result={battle.resultA}
          side="a"
          label="Outfit A"
          voted={voted}
          winner={winner}
          voteResult={voteResult}
          onVote={() => handleVote("a")}
          voting={voting}
        />
        <OutfitCard
          result={battle.resultB}
          side="b"
          label="Outfit B"
          voted={voted}
          winner={winner}
          voteResult={voteResult}
          onVote={() => handleVote("b")}
          voting={voting}
        />
      </div>

      {error && (
        <p className="text-center text-sm text-rose-300">{error}</p>
      )}

      {/* Post-vote summary */}
      {voted && voteResult && (
        <div className="rounded-2xl border border-white/[0.07] bg-slate-950/55 p-5 text-center ring-1 ring-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {total} {total === 1 ? "vote" : "votes"} cast
          </p>
          <p className="mt-1.5 text-sm text-slate-300">
            {winner === "a" ? "Outfit A" : "Outfit B"} is winning with{" "}
            <span className="font-bold text-indigo-300">
              {winner === "a" ? voteResult.percentA : voteResult.percentB}%
            </span>{" "}
            of the vote
          </p>
        </div>
      )}

      {/* CTAs */}
      <div className="space-y-2.5">
        <Link
          href="/"
          className="block w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3.5 text-center text-sm font-bold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98]"
        >
          Create your own battle
        </Link>
        <Link
          href="/"
          className="block w-full rounded-xl border border-white/[0.1] bg-slate-950/60 px-4 py-3.5 text-center text-sm font-semibold text-slate-300 ring-1 ring-white/[0.05] transition hover:border-indigo-400/30 hover:text-white active:scale-[0.98]"
        >
          Rate my own fit on FitRate AI
        </Link>
      </div>
    </div>
  );
}
