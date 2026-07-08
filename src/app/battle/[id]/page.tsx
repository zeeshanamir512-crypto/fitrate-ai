import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBattle, getBattleVotes } from "@/lib/battleStore";
import { formatScore } from "@/lib/formatScore";
import BattleClient from "./BattleClient";

export const dynamic = "force-dynamic";

const APP_URL = "https://fitrate-ai.vercel.app";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const battle = await getBattle(id);
  if (!battle) return { title: "Battle not found | FitRate AI" };

  const scoreA = battle.resultA.result.overallRating;
  // Open battle (no challenger yet): lean into the challenge for shared links.
  const title = battle.resultB
    ? `Outfit Battle: ${formatScore(scoreA)}/10 vs ${formatScore(battle.resultB.result.overallRating)}/10 | FitRate AI`
    : `Outfit Battle: ${formatScore(scoreA)}/10 vs ? | FitRate AI`;
  const description = battle.resultB
    ? `${battle.resultA.result.styleIdentity} vs ${battle.resultB.result.styleIdentity} — Vote for the best outfit!`
    : `${battle.resultA.result.styleIdentity} is waiting for a challenger — think you can beat this fit?`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/battle/${id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BattlePage({ params }: Props) {
  const { id } = await params;
  const [battle, initialVotes] = await Promise.all([
    getBattle(id),
    getBattleVotes(id),
  ]);

  if (!battle) notFound();

  const scoreA = battle.resultA.result.overallRating;
  const scoreB = battle.resultB?.result.overallRating ?? null;

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-12 sm:py-16">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-0 h-[480px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/8 blur-[120px]" />
        <div className="absolute right-1/4 top-0 h-[480px] w-[500px] translate-x-1/2 rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-400/70 transition hover:text-indigo-300"
          >
            FitRate AI
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Outfit Battle
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            <span className="font-semibold text-indigo-300">{formatScore(scoreA)}/10</span>
            {" "}vs{" "}
            <span className="font-semibold text-violet-300">{scoreB !== null ? `${formatScore(scoreB)}/10` : "?"}</span>
            {" "}— {scoreB !== null ? "Vote for the better fit" : "Waiting for a challenger"}
          </p>
        </div>

        {/* Battle */}
        <BattleClient battle={battle} initialVotes={initialVotes} />

        {/* Footer */}
        <p className="mt-10 text-center text-[11px] text-slate-600">
          Battles expire after 30 days &middot;{" "}
          <Link href="/" className="underline transition hover:text-slate-400">
            fitrate-ai.vercel.app
          </Link>
        </p>
      </div>
    </main>
  );
}
