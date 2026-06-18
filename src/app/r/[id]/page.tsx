import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSharedResult } from "@/lib/resultStore";
import { SCORE_BREAKDOWN_KEYS } from "@/types/analysis";
import { LeaderboardSubmitButton } from "@/components/LeaderboardSubmitButton";

export const dynamic = "force-dynamic";

const APP_URL = "https://fitrate-ai.vercel.app";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getSharedResult(id);
  if (!data) return { title: "Result not found | FitRate AI" };

  const score = data.result.overallRating;
  const style = data.result.styleIdentity;
  const title = `${score}/10 — ${style} | FitRate AI`;
  const description = data.result.mainFeedback.slice(0, 155);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/r/${id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  const data = await getSharedResult(id);
  if (!data) notFound();

  const { result, occasion } = data;
  const badges = result.fashionBadges ?? [];
  const score = result.overallRating;
  const scoreColor =
    score >= 8
      ? "text-emerald-400"
      : score >= 6
        ? "text-indigo-300"
        : "text-amber-400";

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-12 sm:py-16">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/2 top-0 h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
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

          {/* Style identity */}
          <p className="relative mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-400/60">
            Style Identity
          </p>
          <p className="relative mb-7 text-center text-lg font-bold leading-snug text-white sm:text-xl">
            {result.styleIdentity}
          </p>

          {/* Score */}
          <div className="relative mb-6 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-slate-950/50 to-violet-600/10 px-6 py-6 text-center ring-1 ring-indigo-400/15">
            <p
              className={`text-7xl font-extrabold leading-none tracking-tight tabular-nums sm:text-8xl ${scoreColor}`}
            >
              {score}
              <span className="text-3xl font-semibold text-slate-500">/10</span>
            </p>
            <p className="mt-3 text-xs font-medium text-slate-400">
              Judged for{" "}
              <span className="font-semibold text-indigo-300">{occasion}</span>
            </p>
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div className="relative mb-6 flex flex-wrap justify-center gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-400/15"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}

          {/* Score breakdown */}
          <div className="relative mb-6 space-y-3 rounded-2xl border border-white/[0.07] bg-slate-950/55 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Breakdown
            </p>
            {SCORE_BREAKDOWN_KEYS.map((item) => {
              const s = result.scoreBreakdown[item.key];
              const pct = Math.min(100, Math.max(4, s * 10));
              return (
                <div key={item.key}>
                  <div className="mb-1.5 flex justify-between text-[11px]">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="tabular-nums font-semibold text-indigo-200">
                      {s}/10
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI verdict */}
          <div className="relative mb-8 rounded-2xl border border-cyan-400/18 bg-cyan-500/[0.05] px-5 py-4 ring-1 ring-cyan-400/10">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400/70">
              AI Verdict
            </p>
            <p className="text-sm leading-relaxed text-slate-200">
              &ldquo;{result.mainFeedback}&rdquo;
            </p>
          </div>

          {/* CTAs */}
          <div className="relative space-y-2.5">
            <Link
              href="/"
              className="block w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3.5 text-center text-sm font-bold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 transition hover:opacity-90 active:scale-[0.98]"
            >
              Can you beat this score?
            </Link>
            <Link
              href={`/battle/new?a=${data.id}`}
              className="block w-full rounded-xl border border-violet-400/30 bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-violet-600/15 px-4 py-3.5 text-center text-sm font-bold text-violet-200 ring-1 ring-violet-400/20 transition hover:border-violet-400/50 hover:text-white active:scale-[0.98]"
            >
              ⚔ Start a Battle
            </Link>
            <LeaderboardSubmitButton resultId={data.id} />
            <Link
              href="/"
              className="block w-full rounded-xl border border-white/[0.1] bg-slate-950/60 px-4 py-3.5 text-center text-sm font-semibold text-slate-300 ring-1 ring-white/[0.05] transition hover:border-indigo-400/30 hover:text-white active:scale-[0.98]"
            >
              Rate your own fit on FitRate AI
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-slate-600">
          Results expire after 30 days &middot;{" "}
          <Link href="/" className="underline transition hover:text-slate-400">
            fitrate-ai.vercel.app
          </Link>
        </p>
      </div>
    </main>
  );
}
