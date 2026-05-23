"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AnalysisResult } from "@/types/analysis";
import { SCORE_BREAKDOWN_KEYS } from "@/types/analysis";
import { BADGE_META, type FashionBadgeId } from "@/lib/fashionBadges";

const SHARE_CARD_BARS = SCORE_BREAKDOWN_KEYS.slice(0, 4);
const WATERMARK_URL = "fitrate-ai.vercel.app";
const APP_URL = `https://${WATERMARK_URL}`;

type CardFormat = "post" | "story";

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
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Rated today";
  return `Rated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function buildShareText(result: AnalysisResult, badges: FashionBadgeId[], occasion: string): string {
  const tip = shorten(result.mainFeedback, 100);
  const badgeLine = badges.length > 0 ? badges.join(" · ") : result.styleKeywords.slice(0, 2).join(" · ");
  return [
    `Just got ${result.overallRating}/10 on FitRate AI 🔥`,
    badgeLine ? `${badgeLine}` : "",
    `"${tip}"`,
    `Rate your fit → ${APP_URL}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function ShareCardProgressBars({ result }: { result: AnalysisResult }) {
  const reduceMotion = useReducedMotion();
  const [animateBars, setAnimateBars] = useState(reduceMotion ?? false);

  useEffect(() => {
    if (reduceMotion) { setAnimateBars(true); return; }
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
                transition={{ duration: reduceMotion ? 0 : 0.85, delay: reduceMotion ? 0 : 0.12 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
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
    const [nativeShareStatus, setNativeShareStatus] = useState<"idle" | "ok">("idle");
    const [format, setFormat] = useState<CardFormat>("post");
    const ratedLabel = useMemo(() => formatRatedLabel(), []);
    const shareText = useMemo(() => buildShareText(result, badges, occasion), [result, badges, occasion]);
    const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

    async function handleCopyText() {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopyStatus("ok");
        window.setTimeout(() => setCopyStatus("idle"), 2200);
      } catch {
        setCopyStatus("err");
        window.setTimeout(() => setCopyStatus("idle"), 2200);
      }
    }

    function handleShareX() {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
    }

    async function handleNativeShare() {
      if (!canNativeShare) return;
      try {
        await navigator.share({ title: "FitRate AI — My Outfit Rating", text: shareText, url: APP_URL });
        setNativeShareStatus("ok");
        window.setTimeout(() => setNativeShareStatus("idle"), 2000);
      } catch {
        // user dismissed — no error to show
      }
    }

    return (
      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">Share your rating</h3>
            <p className="mt-1 text-xs text-slate-400">
              {format === "story" ? "9:16 story-ready — perfect for TikTok &amp; Instagram" : "TikTok &amp; story-ready neon card"}
            </p>
          </div>

          {/* Format toggle */}
          <div className="relative flex gap-0.5 rounded-xl border border-white/[0.1] bg-slate-950/80 p-0.5 shadow-inner ring-1 ring-white/[0.05]">
            <div
              className={`pointer-events-none absolute top-0.5 bottom-0.5 w-[calc(50%-0.25rem)] rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_0_18px_-4px_rgba(99,102,241,0.7)] ring-1 ring-white/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${format === "story" ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0.5"}`}
              aria-hidden
            />
            {(["post", "story"] as CardFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`relative z-10 rounded-lg px-4 py-1.5 text-[11px] font-semibold capitalize transition-colors ${format === f ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                {f === "post" ? "Post" : "Story"}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          key={format}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`mx-auto w-full ${format === "story" ? "max-w-[300px]" : "max-w-[380px]"}`}
        >
          <div
            ref={ref}
            className="relative overflow-hidden rounded-[1.85rem] border border-white/[0.14] bg-[#020617] p-1 shadow-[0_40px_100px_-24px_rgba(79,70,229,0.65)] ring-1 ring-indigo-400/30"
            style={format === "story" ? { aspectRatio: "9/16" } : undefined}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[1.7rem] bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,rgba(99,102,241,0.28),transparent),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(34,211,238,0.14),transparent)]"
              aria-hidden
            />

            <div className={`relative overflow-hidden rounded-[1.55rem] bg-slate-950/80 ${format === "story" ? "flex h-full flex-col" : ""}`}>
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
                  {format === "story" ? "Story" : "Post"}
                </span>
              </div>

              {/* Outfit image */}
              {outfitPreviewUrl ? (
                <div className={`relative mx-3 mt-3 overflow-hidden rounded-2xl border border-white/[0.12] ring-1 ring-indigo-400/20 ${format === "story" ? "flex-1" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={outfitPreviewUrl}
                    alt=""
                    className={`w-full object-cover object-center ${format === "story" ? "h-full" : "aspect-[4/5] max-h-[220px] sm:max-h-[240px]"}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2 rounded-lg border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                    @{occasion.toLowerCase().replace(/\s+/g, "")} fit
                  </div>
                </div>
              ) : (
                <div className={`mx-3 mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-900/50 text-xs text-slate-500 ${format === "story" ? "flex-1 min-h-[120px]" : "aspect-[4/5] max-h-[200px]"}`}>
                  Outfit preview
                </div>
              )}

              {/* Content */}
              <div className="relative space-y-3 px-4 py-3.5 sm:px-5">
                <div className="text-center">
                  <p className="text-lg font-bold tracking-tight text-white">FitRate AI</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-200/90">
                    {brutalMode ? "Brutal AI Rating" : "AI Outfit Rating"}
                  </p>
                </div>

                <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/15 via-slate-950/40 to-violet-600/10 px-4 py-3.5 text-center ring-1 ring-indigo-400/20 backdrop-blur-sm">
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

                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.08] p-3.5 ring-1 ring-cyan-400/15 backdrop-blur-sm">
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

        {/* Action buttons */}
        <div className={`mx-auto flex w-full flex-col gap-2 ${format === "story" ? "max-w-[300px]" : "max-w-[380px]"}`}>
          <motion.button
            type="button"
            onClick={onDownload}
            disabled={downloadLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-premium min-h-11 w-full touch-manipulation rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_44px_-10px_rgba(79,70,229,0.55)] ring-1 ring-indigo-400/30 disabled:opacity-50"
          >
            {downloadLoading ? "Creating image…" : `Download ${format === "story" ? "Story" : "Card"}`}
          </motion.button>

          <div className="grid grid-cols-3 gap-2">
            <motion.button
              type="button"
              onClick={() => void handleCopyText()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="min-h-10 touch-manipulation rounded-xl border border-white/[0.14] bg-slate-950/80 px-2 py-2.5 text-[11px] font-semibold text-slate-100 ring-1 ring-indigo-400/15 transition hover:border-indigo-400/35 hover:text-white"
            >
              {copyStatus === "ok" ? "Copied ✓" : copyStatus === "err" ? "Failed" : "Copy text"}
            </motion.button>

            <motion.button
              type="button"
              onClick={handleShareX}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="min-h-10 touch-manipulation rounded-xl border border-white/[0.14] bg-slate-950/80 px-2 py-2.5 text-[11px] font-semibold text-slate-100 ring-1 ring-indigo-400/15 transition hover:border-indigo-400/35 hover:text-white"
              aria-label="Share on X"
            >
              Share on X
            </motion.button>

            {canNativeShare ? (
              <motion.button
                type="button"
                onClick={() => void handleNativeShare()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="min-h-10 touch-manipulation rounded-xl border border-cyan-400/25 bg-slate-950/80 px-2 py-2.5 text-[11px] font-semibold text-cyan-100 ring-1 ring-cyan-400/15 transition hover:border-cyan-400/45 hover:text-white"
                aria-label="Share via device share sheet"
              >
                {nativeShareStatus === "ok" ? "Shared ✓" : "Share ↗"}
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={() => void handleCopyText()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="min-h-10 touch-manipulation rounded-xl border border-cyan-400/25 bg-slate-950/80 px-2 py-2.5 text-[11px] font-semibold text-cyan-100 ring-1 ring-cyan-400/15 transition hover:border-cyan-400/45 hover:text-white"
              >
                Copy link
              </motion.button>
            )}
          </div>
        </div>

        {downloadError && <p className={`text-center text-xs text-rose-300 ${format === "story" ? "mx-auto max-w-[300px]" : "mx-auto max-w-[380px]"}`}>{downloadError}</p>}
      </div>
    );
  }
);
