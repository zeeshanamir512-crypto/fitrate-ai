"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";

type BrutalModeToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function BrutalModeToggle({ enabled, onChange }: BrutalModeToggleProps) {
  const tooltipId = useId();
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">AI personality</p>
          <p className="mt-0.5 text-xs text-slate-500">Playful roast mode — still respectful</p>
        </div>
        <div className="relative shrink-0">
          <motion.button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-describedby={tooltipId}
            onClick={() => onChange(!enabled)}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onFocus={() => setShowTip(true)}
            onBlur={() => setShowTip(false)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`group relative flex min-h-11 touch-manipulation items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-semibold shadow-lg transition-colors duration-300 sm:px-4 ${
              enabled
                ? "border-amber-400/55 bg-gradient-to-r from-amber-500/20 via-rose-500/15 to-orange-500/20 text-amber-100 shadow-[0_0_36px_-6px_rgba(251,191,36,0.55)] ring-1 ring-amber-400/40"
                : "border-white/[0.12] bg-slate-950/70 text-slate-300 ring-1 ring-white/[0.06] hover:border-amber-400/30 hover:text-white"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs transition ${
                enabled ? "bg-amber-500/30 text-amber-200" : "bg-slate-800 text-slate-400 group-hover:text-amber-200"
              }`}
              aria-hidden
            >
              ⚠
            </span>
            Brutal AI Mode
            <span
              className={`relative ml-0.5 inline-flex h-5 w-9 rounded-full transition-colors ${
                enabled ? "bg-amber-400/80" : "bg-slate-700"
              }`}
              aria-hidden
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md ${
                  enabled ? "left-[18px]" : "left-0.5"
                }`}
              />
            </span>
          </motion.button>
          {showTip && (
            <motion.div
              id={tooltipId}
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-[min(16rem,70vw)] rounded-xl border border-amber-400/35 bg-slate-950/95 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90 shadow-xl ring-1 ring-amber-400/20 backdrop-blur-xl"
            >
              Honest, funny, slightly savage feedback — meme energy without being toxic.
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
