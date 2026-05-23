"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AnalysisResult } from "@/types/analysis";
import { SCORE_BREAKDOWN_KEYS } from "@/types/analysis";

type AnimatedScoreBarsProps = {
  result: AnalysisResult;
  animateKey: number;
};

export function AnimatedScoreBars({ result, animateKey }: AnimatedScoreBarsProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      setMounted(true);
      return;
    }
    setMounted(false);
    const t = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(t);
  }, [animateKey, reduceMotion]);

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {SCORE_BREAKDOWN_KEYS.map((item, index) => {
        const score = result.scoreBreakdown[item.key];
        const pct = Math.min(100, Math.max(8, score * 10));
        return (
          <motion.article
            key={`${item.key}-${animateKey}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.08 * index, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0 rounded-2xl border border-white/[0.09] bg-slate-950/60 p-4 ring-1 ring-white/[0.06] transition duration-300 hover:border-indigo-400/40 hover:bg-slate-900/65 hover:shadow-[0_24px_55px_-20px_rgba(99,102,241,0.32)] sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 0.35 + index * 0.06 }}
                className="text-lg font-bold tabular-nums text-indigo-200"
              >
                {score}/10
              </motion.p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400"
                initial={{ width: mounted ? `${pct}%` : "0%" }}
                animate={{ width: `${pct}%` }}
                transition={{
                  duration: reduceMotion ? 0 : 0.9,
                  delay: reduceMotion ? 0 : 0.2 + index * 0.07,
                  ease: [0.22, 1, 0.36, 1]
                }}
              />
            </div>
            <p className="mt-3 break-words text-xs leading-relaxed text-slate-400">{result.scoreReasons[item.key]}</p>
          </motion.article>
        );
      })}
    </div>
  );
}
