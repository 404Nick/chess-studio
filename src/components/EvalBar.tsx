'use client';

import { motion } from 'framer-motion';
import type { Score } from '@/types';
import { formatScore, winPercent } from '@/lib/engine/uci';

/**
 * Vertical evaluation bar. `score` is always from White's point of view; the bar
 * flips with the board so the side you are playing is always at the bottom.
 */
export function EvalBar({
  score,
  orientation,
  thinking = false,
}: {
  score: Score | null;
  orientation: 'white' | 'black';
  thinking?: boolean;
}) {
  const percent = score ? winPercent(score) : 50;
  const whiteShare = Math.max(2, Math.min(98, percent));
  const bottomShare = orientation === 'white' ? whiteShare : 100 - whiteShare;

  const label = score ? formatScore(score) : '—';
  const advantageWhite = percent >= 50;
  const labelAtBottom = orientation === 'white' ? advantageWhite : !advantageWhite;

  return (
    <div
      className="relative w-7 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#12151d] shadow-inner sm:w-8"
      role="img"
      aria-label={`Evaluation ${label}`}
    >
      {/* The "bottom" side's share of the bar. */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{
          background:
            orientation === 'white'
              ? 'linear-gradient(180deg, #f2f4f8 0%, #d7dbe4 100%)'
              : 'linear-gradient(180deg, #2b3040 0%, #171b26 100%)',
        }}
        animate={{ height: `${bottomShare}%` }}
        transition={{ type: 'spring', stiffness: 140, damping: 24, mass: 0.6 }}
      />

      {/* Mid-line marker at exactly 50%. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(110,168,254,0.55)]" />

      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={labelAtBottom ? { bottom: 4 } : { top: 4 }}
      >
        <span
          className="rounded px-1 py-0.5 font-mono text-[0.6rem] font-bold tabular-nums"
          style={{
            color: labelAtBottom === (orientation === 'white') ? '#12151d' : '#e8ecf5',
            background: 'transparent',
          }}
        >
          {label}
        </span>
      </div>

      {thinking ? (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[rgba(110,168,254,0.10)]"
          animate={{ opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
    </div>
  );
}
