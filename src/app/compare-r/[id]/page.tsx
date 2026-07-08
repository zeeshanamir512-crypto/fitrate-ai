import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSharedCompareResult } from "@/lib/compareResultStore";
import { formatScore } from "@/lib/formatScore";

export const dynamic = "force-dynamic";

const APP_URL = "https://fitrate-ai.vercel.app";

type Props = { params: Promise<{ id: string }> };

function winnerLabel(winner: "A" | "B" | "Tie"): string {
  if (winner === "Tie") return "It’s a tie";
  return winner === "A" ? "Outfit A" : "Outfit B";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getSharedCompareResult(id);
  if (!data) return { title: "Comparison not found | FitRate AI" };

  const { compare } = data;
  const title = `${winnerLabel(compare.winner)} wins — ${formatScore(compare.scoreA)} vs ${formatScore(compare.scoreB)} | FitRate AI`;
  const description = compare.winnerReason.slice(0, 155);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/compare-r/${id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CompareResultPage({ params }: Props) {
  const { id } = await params;
  const data = await getSharedCompareResult(id);
  if (!data) notFound();

  const { compare, occasion, thumbnailA, thumbnailB } = data;

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-12 sm:py-16">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-xl">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-400/70 transition hover:text-indigo-300"
          >
            FitRate AI
          </Link>
        </div>

        {/* Card */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-slate-950/80 p-6 shadow-[0_40px_100px_-24px_rgba(139,92,246,0.45)] ring-1 ring-violet-400/20 backdrop-blur-xl sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% -5%, rgba(139,92,246,0.18) 0%, transparent 70%)",
            }}
            aria-hidden
          />

          <p className="relative mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/70">
            AI Outfit Comparison
          </p>

          {/* Winner */}
          <p className="relative mb-2 text-center text-2xl font-bold leading-snug text-white sm:text-3xl">
            {winnerLabel(compare.winner)}
          </p>
          <div className="relative mb-7 text-center">
            <span className="inline-flex rounded-full border border-amber-400/45 bg-gradient-to-r from-amber-500/25 to-amber-600/15 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 ring-1 ring-amber-300/40">
              {compare.closeness}
            </span>
          </div>

          {/* Score tiles */}
          <div className="relative mb-6 grid grid-cols-2 gap-3">
            <div
              className={`relative overflow-hidden rounded-2xl border px-3 py-5 text-center ${
                compare.winner === "A"
                  ? "border-amber-400/45 bg-amber-500/10 ring-1 ring-amber-400/25"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {thumbnailA && (
                <img
                  src={thumbnailA}
                  alt="Outfit A"
                  className="mx-auto mb-3 h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
                />
              )}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200/95">Outfit A</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white">
                {formatScore(compare.scoreA)}
                <span className="text-lg font-semibold text-slate-500">/10</span>
              </p>
              {compare.winner === "A" && (
                <span className="mt-2 inline-block rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                  Winner
                </span>
              )}
            </div>
            <div
              className={`relative overflow-hidden rounded-2xl border px-3 py-5 text-center ${
                compare.winner === "B"
                  ? "border-amber-400/45 bg-amber-500/10 ring-1 ring-amber-400/25"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {thumbnailB && (
                <img
                  src={thumbnailB}
                  alt="Outfit B"
                  className="mx-auto mb-3 h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
                />
              )}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">Outfit B</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white">
                {formatScore(compare.scoreB)}
                <span className="text-lg font-semibold text-slate-500">/10</span>
              </p>
              {compare.winner === "B" && (
                <span className="mt-2 inline-block rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                  Winner
                </span>
              )}
            </div>
          </div>

          <p className="relative mb-6 text-center text-xs font-medium text-slate-400">
            Judged for <span className="font-semibold text-indigo-300">{occasion}</span>
          </p>

          {/* Reason */}
          <div className="relative mb-6 rounded-2xl border border-cyan-400/18 bg-cyan-500/[0.05] px-5 py-4 ring-1 ring-cyan-400/10">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400/70">
              Why it won
            </p>
            <p className="text-sm leading-relaxed text-slate-200">&ldquo;{compare.winnerReason}&rdquo;</p>
          </div>

          {/* Per-outfit feedback */}
          <div className="relative mb-6 space-y-3 rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4">
            <p className="text-sm leading-snug text-slate-200">
              <span className="font-semibold text-indigo-200">A:</span> {compare.outfitAFeedback}
            </p>
            <p className="text-sm leading-snug text-slate-200">
              <span className="font-semibold text-violet-200">B:</span> {compare.outfitBFeedback}
            </p>
          </div>

          {/* Tips */}
          {compare.weakerOutfitTips.length > 0 && (
            <div className="relative mb-8 rounded-2xl border border-emerald-400/18 bg-emerald-500/[0.05] px-5 py-4 ring-1 ring-emerald-400/10">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
                Sharpen the weaker look
              </p>
              <ul className="space-y-2 text-sm leading-relaxed text-slate-200">
                {compare.weakerOutfitTips.map((tip, i) => (
                  <li key={`tip-${i}`} className="flex gap-2">
                    <span aria-hidden className="text-emerald-300/70">
                      •
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTAs — bridge into single mode rather than shoehorning battle/leaderboard here */}
          <div className="relative space-y-2.5">
            <Link
              href="/"
              className="block w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3.5 text-center text-sm font-bold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98]"
            >
              Compare your own outfits
            </Link>
            <Link
              href="/"
              className="block w-full rounded-xl border border-white/[0.1] bg-slate-950/60 px-4 py-3.5 text-center text-sm font-semibold text-slate-300 ring-1 ring-white/[0.05] transition hover:border-indigo-400/30 hover:text-white active:scale-[0.98]"
            >
              Rate a single fit on FitRate AI
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-slate-600">
          Comparisons expire after 30 days &middot;{" "}
          <Link href="/" className="underline transition hover:text-slate-400">
            fitrate-ai.vercel.app
          </Link>
        </p>
      </div>
    </main>
  );
}
