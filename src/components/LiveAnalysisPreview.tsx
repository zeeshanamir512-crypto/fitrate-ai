"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const ANALYSIS_ROWS = [
  { label: "Color Harmony", pct: 92 },
  { label: "Fit & Silhouette", pct: 88 },
  { label: "Trend Match", pct: 95 },
  { label: "Occasion Match", pct: 86 }
] as const;

const FLOAT_TAGS = [
  { text: "Clean Fit", className: "-left-1 top-6 md:-left-3 md:top-10" },
  { text: "Streetwear", className: "-right-1 top-12 md:-right-4 md:top-8" },
  { text: "Balanced Colors", className: "-left-2 bottom-24 md:-left-5 md:bottom-28" },
  { text: "Strong Silhouette", className: "-right-2 bottom-16 md:-right-5 md:bottom-20" }
] as const;

function OutfitPlaceholder() {
  return (
    <div className="relative flex aspect-[4/5] min-h-[140px] w-full max-w-[160px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/35 via-slate-900/90 to-cyan-600/25 ring-1 ring-white/15 sm:min-h-[168px] sm:max-w-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(99,102,241,0.35),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_90%,rgba(34,211,238,0.2),transparent)]" aria-hidden />

      {/* Abstract outfit shapes */}
      <svg className="relative z-[1] w-[52%] text-indigo-100/90" viewBox="0 0 80 120" fill="none" aria-hidden>
        <path
          d="M40 8 L62 22 L58 48 L22 48 L18 22 Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="opacity-90"
        />
        <path d="M28 48 L28 92 L52 92 L52 48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-75" />
        <ellipse cx="40" cy="104" rx="18" ry="6" stroke="currentColor" strokeWidth="2" className="opacity-50" />
      </svg>

      <div className="fitrate-live-scan-line pointer-events-none absolute inset-x-0 top-0 z-[2] h-[3px] shadow-[0_0_12px_rgba(34,211,238,0.9)]" aria-hidden />
    </div>
  );
}

export function LiveAnalysisPreview() {
  const reduceMotion = useReducedMotion();
  const [rating, setRating] = useState(reduceMotion ? 9.1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      setRating(9.1);
      return;
    }
    const ctrl = animate(0, 9.1, {
      duration: 1.85,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setRating(Math.round(v * 10) / 10)
    });
    return () => ctrl.stop();
  }, [reduceMotion]);

  const tagMotion = reduceMotion
    ? {}
    : {
        y: [0, -5, 0],
        transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const }
      };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-xl px-0 sm:mt-12 sm:max-w-2xl lg:max-w-3xl">
      {/* Floating tags — tucked closer on small screens */}
      <div className="pointer-events-none absolute inset-0 -z-0 hidden sm:block" aria-hidden>
        {FLOAT_TAGS.map((tag, i) => (
          <motion.span
            key={tag.text}
            animate={tagMotion}
            transition={
              reduceMotion
                ? undefined
                : { duration: 3.5 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }
            }
            className={`absolute rounded-full border border-white/[0.14] bg-slate-950/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 shadow-[0_8px_28px_-8px_rgba(99,102,241,0.45)] backdrop-blur-md md:px-3 md:text-[11px] ${tag.className}`}
          >
            {tag.text}
          </motion.span>
        ))}
      </div>

      {/* Compact tags on mobile */}
      <div className="mb-3 flex flex-wrap justify-center gap-2 sm:hidden">
        {FLOAT_TAGS.map((tag) => (
          <span
            key={tag.text}
            className="rounded-full border border-white/[0.12] bg-slate-950/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur-sm"
          >
            {tag.text}
          </span>
        ))}
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        whileHover={
          reduceMotion
            ? undefined
            : {
                y: -6,
                transition: { duration: 0.25 }
              }
        }
        className="relative mx-auto rounded-[1.35rem] bg-gradient-to-br from-indigo-500/55 via-violet-500/35 to-cyan-500/35 p-[1px] shadow-[0_28px_80px_-24px_rgba(79,70,229,0.55)] ring-1 ring-white/10"
      >
        <motion.div
          whileHover={
            reduceMotion
              ? undefined
              : {
                  boxShadow: "0 32px 90px -20px rgba(99,102,241,0.55), 0 0 60px -12px rgba(34,211,238,0.22)"
                }
          }
          className="relative overflow-hidden rounded-[1.3rem] border border-white/[0.08] bg-slate-950/80 px-4 py-5 shadow-inner shadow-black/40 backdrop-blur-2xl transition-[border-color] duration-300 hover:border-indigo-400/35 sm:px-6 sm:py-6"
        >
          {/* Ambient particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
            {[...Array(12)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-1 w-1 rounded-full bg-indigo-400/50 blur-[0.5px]"
                style={{
                  left: `${8 + ((i * 7) % 84)}%`,
                  top: `${10 + ((i * 11) % 75)}%`
                }}
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        opacity: [0.15, 0.55, 0.15],
                        scale: [1, 1.6, 1]
                      }
                }
                transition={{
                  duration: 3 + (i % 4) * 0.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15
                }}
              />
            ))}
          </div>

          {/* Header */}
          <div className="relative z-[1] flex flex-col gap-3 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-300/95">Live AI preview</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-100 shadow-[0_0_20px_-6px_rgba(99,102,241,0.6)]">
              <motion.span
                className="relative flex h-2 w-2"
                aria-hidden
                animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [1, 0.65, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="absolute inset-0 rounded-full bg-emerald-400/90 blur-[2px]" />
                <span className="relative m-auto block h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              </motion.span>
              Scanning outfit…
            </div>
          </div>

          {/* Body */}
          <div className="relative z-[1] mt-5 grid gap-6 md:grid-cols-[minmax(0,170px)_1fr] md:items-start md:gap-8">
            <div className="mx-auto w-full max-w-[180px] md:mx-0 md:max-w-none">
              <OutfitPlaceholder />
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">AI Analysis Complete</p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <motion.span
                  className="bg-gradient-to-br from-white via-indigo-100 to-cyan-200 bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  {rating.toFixed(1)}
                </motion.span>
                <span className="pb-1 text-lg font-semibold text-slate-500 sm:text-xl">/10</span>
              </div>

              <p className="text-sm text-slate-400">
                Streetwear confidence: <span className="font-semibold text-indigo-200">High</span>
              </p>

              <ul className="space-y-3 pt-1">
                {ANALYSIS_ROWS.map((row, i) => (
                  <li key={row.label}>
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate text-slate-400">{row.label}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-slate-200">{row.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-white/[0.06]">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 shadow-[0_0_12px_rgba(99,102,241,0.45)]"
                        initial={reduceMotion ? false : { width: 0 }}
                        whileInView={reduceMotion ? undefined : { width: `${row.pct}%` }}
                        viewport={{ once: true, margin: "-20px" }}
                        transition={{
                          duration: reduceMotion ? 0 : 1.15,
                          delay: reduceMotion ? 0 : 0.35 + i * 0.12,
                          ease: [0.22, 1, 0.36, 1]
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI Tip */}
          <div className="relative z-[1] mt-6 rounded-xl border border-white/[0.08] bg-gradient-to-r from-indigo-500/[0.08] via-transparent to-cyan-500/[0.06] p-4 ring-1 ring-indigo-400/15">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/90">AI Tip</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Try adding a silver accessory or a sharper sneaker shape to make the fit stand out more.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
