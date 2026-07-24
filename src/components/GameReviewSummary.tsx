'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { GameReview, MoveClass } from '@/types';
import { CLASS_ORDER, MOVE_CLASS_META } from '@/lib/analysis/classify';
import { useTranslation } from '@/lib/i18n';
import { MoveQualityBadge } from './MoveQualityBadge';

const DISPLAY_ORDER: readonly MoveClass[] = CLASS_ORDER.filter((id) => id !== 'forced');

function AccuracyDial({ label, value, tint }: { label: string; value: number; tint: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-[66px] w-[66px]">
        <svg viewBox="0 0 66 66" className="h-full w-full -rotate-90">
          <circle cx="33" cy="33" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <motion.circle
            cx="33"
            cy="33"
            r={radius}
            fill="none"
            stroke={tint}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ type: 'spring', stiffness: 90, damping: 20 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold tabular-nums">
          {value.toFixed(1)}
        </span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function EvalGraph({
  series,
  cursor,
  onSelect,
}: {
  series: readonly number[];
  cursor: number;
  onSelect(index: number): void;
}) {
  const { t } = useTranslation();
  const width = 100;
  const height = 34;

  const path = useMemo(() => {
    if (series.length < 2) return '';
    const step = width / (series.length - 1);
    const toY = (value: number) => height / 2 - (Math.max(-6, Math.min(6, value)) / 6) * (height / 2 - 2);
    const points = series.map((value, index) => `${(index * step).toFixed(2)},${toY(value).toFixed(2)}`);
    return `M0,${height / 2} L${points.join(' L')} L${width},${height / 2} Z`;
  }, [series]);

  const line = useMemo(() => {
    if (series.length < 2) return '';
    const step = width / (series.length - 1);
    const toY = (value: number) => height / 2 - (Math.max(-6, Math.min(6, value)) / 6) * (height / 2 - 2);
    return series.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(2)},${toY(value).toFixed(2)}`).join(' ');
  }, [series]);

  if (series.length < 2) return null;

  const cursorX = ((cursor + 1) / (series.length - 1)) * width;

  return (
    <div className="px-3 pb-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full cursor-pointer rounded-lg bg-black/25"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSelect(Math.round(ratio * (series.length - 1)) - 1);
        }}
      >
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.14)" strokeWidth="0.4" />
        <path d={path} fill="rgba(232,236,245,0.16)" />
        <path d={line} fill="none" stroke="#e8ecf5" strokeWidth="0.8" strokeLinejoin="round" />
        {cursor >= -1 ? (
          <line
            x1={cursorX}
            y1="0"
            x2={cursorX}
            y2={height}
            stroke="#6ea8fe"
            strokeWidth="0.7"
          />
        ) : null}
      </svg>
      <p className="mt-1 text-center text-[0.62rem] text-[var(--text-muted)]">
        {t('review.evalGraph')}
      </p>
    </div>
  );
}

export function GameReviewSummary({
  review,
  cursor,
  onSelect,
}: {
  review: GameReview;
  cursor: number;
  onSelect(index: number): void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20">
      <div className="flex items-center justify-around gap-4 px-3 py-4">
        <AccuracyDial label={t('board.white')} value={review.accuracy.white} tint="#e8ecf5" />
        <div className="text-center">
          <p className="stat-label">{t('review.averageLoss')}</p>
          <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
            {(review.averageCpLoss.w / 100).toFixed(2)} / {(review.averageCpLoss.b / 100).toFixed(2)}
          </p>
          <p className="mt-2 stat-label">{t('review.depth')}</p>
          <p className="font-mono text-xs text-[var(--text-secondary)]">{review.depth}</p>
        </div>
        <AccuracyDial label={t('board.black')} value={review.accuracy.black} tint="#6ea8fe" />
      </div>

      <EvalGraph series={review.evalSeries} cursor={cursor} onSelect={onSelect} />

      <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {DISPLAY_ORDER.filter((id) => review.counts.w[id] + review.counts.b[id] > 0).map((id) => (
          <div key={id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1.5">
            <span className="flex items-center gap-2 text-xs">
              <MoveQualityBadge classification={id} size={16} />
              <span style={{ color: MOVE_CLASS_META[id].color }}>{t(`class.${id}`)}</span>
            </span>
            <span className="w-8 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {review.counts.w[id]}
            </span>
            <span className="w-8 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {review.counts.b[id]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
