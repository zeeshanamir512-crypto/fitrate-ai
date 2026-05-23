"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AnalysisResult } from "@/types/analysis";
import { SCORE_BREAKDOWN_KEYS } from "@/types/analysis";
import { BADGE_META, type FashionBadgeId } from "@/lib/fashionBadges";

const SHARE_CARD_BARS = SCORE_BREAKDOWN_KEYS.slice(0, 4);
const WATERMARK_URL = "fitrate-ai.vercel.app";

type ShareableResultCardProps = {
  result: AnalysisResult;
  badges: FashionBadgeId[];
  occasion: string;
  outfitPreviewUrl: string | null;
  brutalMode?: boolean;
  onDownload: () => void;
  downloadLoading: boolean;
  downloadError: string | null;
};

function shorten(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatRatedLabel(date = new Date()): string {
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isSameDay) return "Rated today";
  return `Rated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function ShareCardProgressBars({ result }: { result: AnalysisResult }) {
  const reduceMotion = useReducedMotion();
  const [animateBars, setAnimateBars] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      setAnimateBars(true);
      return;
    }
    setAnimateBars(false);
    const t = window.setTimeout(() => setAnimateBars(true), 120);
    return () => window.clearTimeout(t);
  }, [result.overallRating, reduceMotion]);

  return (
    <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-slate-950/55 p-3.5 shadow-inner shadow-black/30 backdrop-blur-md ring-1 ring-indigo-400/15">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/80">Fit breakdown</p>
      {SHARE_CARD_BARS.map((item, index) => {
        const score = result.scoreBreakdown[item.key];
        const pct = Math.min(100, Math.max(6, score * 10));
        return (
          <div key={item.key}>
            <div className="flex justify-between gap-2 text-[10px]">
              <span className="truncate text-slate-400">{item.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-indigo-200">{score}/10</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 shadow-[0_0_10px_rgba(99,102,241,0.45)]"
                initial={{ width: reduceMotion ? `${pct}%` : "0%" }}
                animate={{ width: animateBars ? `${pct}%` : "0%" }}
                transition={{
                  duration: reduceMotion ? 0 : 0.85,
                  delay: reduceMotion ? 0 : 0.12 + index * 0.08,
                  ease: [0.22, 1, 0.36, 1]
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const ShareableResultCard = forwardRef<HTMLDivElement, ShareableResultCardProps>(
  function ShareableResultCard(
    { result, badges, occasion, outfitPreviewUrl, brutalMode, onDownload, downloadLoading, downloadError },
    ref
  ) {
    const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "err">("idle");
    const ratedLabel = useMemo(() => formatRatedLabel(), []);

    async function handleCopyShareLink() {
      const origin = typeof window !== "undefined" ? window.location.origin : `https://${WATERMARK_URL}`;
      const tip = shorten(result.mainFeedback, 120);
      const badgeLine = badges.length > 0 ? badges.join(" · ") : result.styleKeywords.slice(0, 2).join(" · ");
      const text = [
        `FitRate AI — ${result.overallRating}/10`,
        `@fitrate_user · ${ratedLabel}`,
        `Occasion: ${occasion}`,
        badgeLine ? `Badges: ${badgeLine}` : "",
        `Tip: ${tip}`,
        origin
      ]
        .filter(Boolean)
        .join("\n");

      try {
        await navigator.clipboard.writeText(text);
        setCopyStatus("ok");
        window.setTimeout(() => setCopyStatus("idle"), 2200);
      } catch {
        setCopyStatus("err");
        window.setTimeout(() => setCopyStatus("idle"), 2200);
      }
    }

    return (
      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">Share your rating</h3>
            <p className="mt-1 text-xs text-slate-400">TikTok &amp; story-ready neon card</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mx-auto w-full max-w-[380px]"
        >
          <div
            ref={ref}
            className="relative overflow-hidden rounded-[1.85rem] border border-white/[0.14] bg-[#020617] p-1 shadow-[0_40px_100px_-24px_rgba(79,70,229,0.65)] ring-1 ring-indigo-400/30"
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[1.7rem] bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,rgba(99,102,241,0.28),transparent),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(34,211,238,0.14),transparent)]"
              aria-hidden
            />

            <div className="relative overflow-hidden rounded-[1.55rem] bg-slate-950/80">
              {/* Story-style top meta */}
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 backdrop-blur-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-indigo-400/35 bg-gradient-to-br from-indigo-500/30 to-violet-600/20 text-xs font-bold text-indigo-100 ring-1 ring-white/10">
                    FR
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">@fitrate_user</p>
                    <p className="text-[10px] text-slate-400">{ratedLabel}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-200">
                  Story
                </span>
              </div>

              {outfitPreviewUrl ? (
                <div className="relative mx-3 mt-3 overflow-hidden rounded-2xl border border-white/[0.12] ring-1 ring-indigo-400/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={outfitPreviewUrl}
                    alt=""
                    className="aspect-[4/5] max-h-[220px] w-full object-cover object-center sm:max-h-[240px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2 rounded-lg border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                    @{occasion.toLowerCase().replace(/\s+/g, "")} fit
                  </div>
                </div>
              ) : (
                <div className="mx-3 mt-3 flex aspect-[4/5] max-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-900/50 text-xs text-slate-500">
                  Outfit preview
                </div>
              )}

              <div className="relative space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white">FitRate AI</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-200/90">
                    {brutalMode ? "Brutal AI Rating" : "AI Outfit Rating"}
                  </p>
                </div>

                <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/15 via-slate-950/40 to-violet-600/10 px-4 py-4 text-center ring-1 ring-indigo-400/20 backdrop-blur-sm">
                  <p className="text-[4rem] font-extrabold leading-none tracking-tight text-white tabular-nums drop-shadow-[0_0_36px_rgba(99,102,241,0.45)] sm:text-[4.25rem]">
                    {result.overallRating}
                    <span className="text-2xl font-semibold text-indigo-300/90">/10</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-300">
                    Judged for <span className="font-semibold text-indigo-200">{occasion}</span>
                  </p>
                </div>

                {badges.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {badges.map((b, i) => (
                      <motion.span
                        key={b}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.15 + i * 0.1, duration: 0.35 }}
                        className={`inline-flex items-center gap-1 rounded-xl border bg-gradient-to-br px-2.5 py-1.5 text-[10px] font-semibold shadow-md backdrop-blur-md ${BADGE_META[b].accent}`}
                      >
                        <span aria-hidden>{BADGE_META[b].icon}</span>
                        {b}
                      </motion.span>
                    ))}
                  </div>
                )}

                <ShareCardProgressBars result={result} />

                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/8 p-3.5 ring-1 ring-cyan-400/15 backdrop-blur-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">AI tip</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-100">
                    &ldquo;{shorten(result.mainFeedback, 140)}&rdquo;
                  </p>
                </div>

                <div className="flex flex-col items-center gap-1 border-t border-white/[0.08] pt-3">
                  <p className="text-[11px] font-semibold tracking-wide text-indigo-200/90">FitRate AI</p>
                  <p className="text-[10px] font-medium text-slate-500">{WATERMARK_URL}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-2 sm:flex-row">
          <motion.button
            type="button"
            onClick={onDownload}
            disabled={downloadLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-premium min-h-11 flex-1 touch-manipulation rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 disabled:opacity-50"
          >
            {downloadLoading ? "Creating image…" : "Download Card"}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => void handleCopyShareLink()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="min-h-11 flex-1 touch-manipulation rounded-xl border border-white/[0.14] bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-100 ring-1 ring-indigo-400/20 transition hover:border-indigo-400/40 hover:text-white"
          >
            {copyStatus === "ok" ? "Copied!" : copyStatus === "err" ? "Copy failed" : "Copy Share Link"}
          </motion.button>
        </div>
        {downloadError && <p className="text-center text-xs text-rose-300">{downloadError}</p>}
      </div>
    );
  }
);
