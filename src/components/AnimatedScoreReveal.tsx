"use client";

import { useEffect } from "react";
import { motion, useSpring, useTransform, useReducedMotion } from "framer-motion";

type AnimatedScoreRevealProps = {
  rating: number;
  gradientId: string;
  animateKey: number;
};

function AnimatedScoreRing({ rating, gradientId }: { rating: number; gradientId: string }) {
  const reduceMotion = useReducedMotion();
  const r = 40;
  const c = 2 * Math.PI * r;
  const pctSpring = useSpring(0, { stiffness: 55, damping: 18 });
  const pct = useTransform(pctSpring, (v) => Math.min(1, Math.max(0, v / 10)));
  const dashOffset = useTransform(pct, (p) => c * (1 - p));

  useEffect(() => {
    pctSpring.set(reduceMotion ? rating : 0);
    if (!reduceMotion) {
      const t = window.setTimeout(() => pctSpring.set(rating), 80);
      return () => window.clearTimeout(t);
    }
  }, [rating, pctSpring, reduceMotion]);

  return (
    <svg width={112} height={112} viewBox="0 0 112 112" className="shrink-0 -rotate-90" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="56" cy="56" r={r} fill="none" className="stroke-slate-900/95" strokeWidth="7" />
      <motion.circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        style={{ strokeDashoffset: dashOffset }}
      />
    </svg>
  );
}

export function AnimatedScoreReveal({ rating, gradientId, animateKey }: AnimatedScoreRevealProps) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(0, { stiffness: 50, damping: 16 });
  const display = useTransform(spring, (v) => (reduceMotion ? rating.toFixed(1) : v.toFixed(1)));

  useEffect(() => {
    spring.set(0);
    if (reduceMotion) {
      spring.set(rating);
      return;
    }
    const t = window.setTimeout(() => spring.set(rating), 120);
    return () => window.clearTimeout(t);
  }, [rating, spring, reduceMotion, animateKey]);

  return (
    <motion.div
      key={animateKey}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-indigo-400/40 bg-gradient-to-br from-indigo-500/40 via-indigo-600/25 to-violet-700/30 px-6 py-6 shadow-[0_0_72px_-8px_rgba(99,102,241,0.75)] ring-1 ring-indigo-300/35 sm:w-auto sm:min-w-[260px] sm:px-8 sm:py-7"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        animate={
          reduceMotion
            ? undefined
            : {
                boxShadow: [
                  "0 0 40px rgba(99,102,241,0.35)",
                  "0 0 56px rgba(139,92,246,0.5)",
                  "0 0 40px rgba(99,102,241,0.35)"
                ]
              }
        }
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-violet-500/25 blur-2xl" aria-hidden />
      <p className="relative text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-indigo-100/95">
        Overall Outfit
      </p>
      <div className="relative mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <AnimatedScoreRing rating={rating} gradientId={gradientId} />
        <div className="text-center sm:text-left">
          <p className="text-6xl font-bold tabular-nums tracking-tight text-white drop-shadow-[0_0_28px_rgba(99,102,241,0.45)] sm:text-7xl">
            <motion.span>{display}</motion.span>
            <span className="text-3xl font-semibold text-indigo-200/90">/10</span>
          </p>
        </div>
      </div>
      <ScoreBarFill rating={rating} animateKey={animateKey} />
    </motion.div>
  );
}

function ScoreBarFill({ rating, animateKey }: { rating: number; animateKey: number }) {
  const reduceMotion = useReducedMotion();
  const widthPct = Math.min(100, Math.max(6, rating * 10));

  return (
    <div className="relative mx-auto mt-5 h-2.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-950/85 ring-1 ring-white/[0.1]">
      <motion.div
        key={animateKey}
        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-500 to-cyan-400 shadow-[0_0_18px_rgba(99,102,241,0.85)]"
        initial={{ width: reduceMotion ? `${widthPct}%` : "0%" }}
        animate={{ width: `${widthPct}%` }}
        transition={{ duration: reduceMotion ? 0 : 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
