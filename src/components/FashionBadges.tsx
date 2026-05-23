"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BADGE_META, type FashionBadgeId } from "@/lib/fashionBadges";

type FashionBadgesProps = {
  badges: FashionBadgeId[];
  animateKey: number;
};

export function FashionBadges({ badges, animateKey }: FashionBadgesProps) {
  const reduceMotion = useReducedMotion();
  if (badges.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Fashion badges unlocked</p>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {badges.map((badge, index) => {
          const meta = BADGE_META[badge];
          return (
            <motion.li
              key={`${badge}-${animateKey}`}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: reduceMotion ? 0 : 0.18 + index * 0.14,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1]
              }}
              whileHover={{ scale: 1.04, y: -2 }}
              className={`flex min-h-10 max-w-full items-center gap-2 rounded-xl border bg-gradient-to-br px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md ${meta.accent}`}
            >
              <span className="text-base leading-none" aria-hidden>
                {meta.icon}
              </span>
              <span className="truncate">{badge}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
