"use client";

import { motion, AnimatePresence } from "framer-motion";

type AnalyzingOverlayProps = {
  visible: boolean;
  brutalMode?: boolean;
};

export function AnalyzingOverlay({ visible, brutalMode }: AnalyzingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-5 overflow-hidden rounded-2xl border border-indigo-400/25 bg-slate-950/80 p-6 ring-1 ring-indigo-400/20 backdrop-blur-xl sm:p-8"
        >
          <div className="flex flex-col items-center text-center">
            <motion.div
              className="relative h-16 w-16"
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            >
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 border-r-cyan-400" />
              <div className="absolute inset-2 rounded-full bg-indigo-500/10 blur-md" />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-4 text-sm font-semibold text-white"
            >
              {brutalMode ? "Brutal stylist is judging your fit…" : "AI stylist is analyzing your fit…"}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-2 text-xs text-slate-400"
            >
              Scoring silhouette, colors, shoes &amp; vibe
            </motion.p>
            <div className="mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400"
                initial={{ width: "8%" }}
                animate={{ width: ["8%", "72%", "42%", "88%"] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
