"use client";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  streak: number;
  justIncreased: boolean;
};

export function StreakBadge({ streak, justIncreased }: Props) {
  if (streak === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="streak-badge"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={
          justIncreased
            ? {
                scale: [1, 1.28, 0.92, 1.12, 1],
                opacity: 1,
                boxShadow: [
                  "0 0 0px rgba(251,146,60,0)",
                  "0 0 18px rgba(251,146,60,0.65)",
                  "0 0 8px rgba(251,146,60,0.35)",
                  "0 0 0px rgba(251,146,60,0)",
                ],
              }
            : { scale: 1, opacity: 1, boxShadow: "0 0 0px rgba(251,146,60,0)" }
        }
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="flex shrink-0 items-center gap-1 rounded-full border border-orange-400/20 bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold text-orange-300 backdrop-blur-sm sm:px-2.5 sm:text-xs"
        title={`${streak}-day streak`}
      >
        <span className="text-sm leading-none sm:text-base" aria-hidden>🔥</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={streak}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            {streak}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
