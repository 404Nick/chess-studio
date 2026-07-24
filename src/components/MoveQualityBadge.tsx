'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { MoveClass } from '@/types';
import { MOVE_CLASS_META } from '@/lib/analysis/classify';
import { useClassLabel } from '@/lib/i18n';
import { ClassificationIcon } from './ClassificationIcon';

export function MoveQualityBadge({
  classification,
  size = 20,
  withLabel = false,
  className,
}: {
  classification: MoveClass;
  size?: number;
  withLabel?: boolean;
  className?: string;
}) {
  const meta = MOVE_CLASS_META[classification];
  const label = useClassLabel(classification);

  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <ClassificationIcon classification={classification} size={size} title={label} />
      {withLabel ? (
        <span className="text-xs font-semibold" style={{ color: meta.color }}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The badge that pops onto the board over the destination square when a move is
 * classified. Uses a spring entrance plus an expanding ring for emphasis.
 */
export function BoardQualityBadge({
  classification,
  size,
  x,
  y,
}: {
  classification: MoveClass;
  size: number;
  x: number;
  y: number;
}) {
  const meta = MOVE_CLASS_META[classification];

  return (
    <motion.div
      key={`${classification}-${x}-${y}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y, width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full animate-pulse-ring"
        style={{ background: meta.ring }}
        aria-hidden
      />
      <div
        className="relative rounded-full"
        style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.85))' }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 2px rgba(8,10,16,0.9)' }}
          aria-hidden
        />
        <ClassificationIcon classification={classification} size={size} />
      </div>
    </motion.div>
  );
}
