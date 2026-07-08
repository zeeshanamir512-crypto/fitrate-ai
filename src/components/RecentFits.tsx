"use client";

import { motion } from "framer-motion";
import type { FitHistoryEntry } from "@/lib/fitHistory";
import { formatScore } from "@/lib/formatScore";

type Props = { history: FitHistoryEntry[] };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 8.5) return "text-emerald-300";
  if (score >= 7) return "text-indigo-200";
  if (score >= 5) return "text-amber-300";
  return "text-rose-300";
}

export function RecentFits({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <section className="mx-auto mt-6 w-full max-w-6xl sm:mt-8">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        Recent fits
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {history.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="group relative w-[96px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.09] bg-slate-900/60 ring-1 ring-white/[0.04] backdrop-blur-md transition duration-200 hover:border-indigo-400/30 hover:ring-indigo-400/15"
          >
            <div className="relative h-[96px] overflow-hidden bg-slate-950">
              {entry.thumbnail ? (
                <img
                  src={entry.thumbnail}
                  alt={`${entry.occasion} outfit`}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-900/80 text-2xl">
                  👗
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <p className={`absolute bottom-1.5 left-0 right-0 text-center text-[13px] font-bold tabular-nums ${scoreColor(entry.score)}`}>
                {formatScore(entry.score)}
                <span className="text-[9px] font-medium text-slate-400">/10</span>
              </p>
            </div>
            <div className="px-2 pb-2.5 pt-2">
              <p className="truncate text-[10px] font-semibold leading-none text-slate-200">{entry.occasion}</p>
              <p className="mt-1 text-[9px] leading-none text-slate-500">{timeAgo(entry.date)}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
