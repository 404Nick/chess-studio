'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { Color, EngineLine } from '@/types';
import { formatScore, scoreToNumber } from '@/lib/engine/uci';
import { EmptyState, Spinner } from './ui/Primitives';

function scoreTone(line: EngineLine, mover: Color): string {
  const value = mover === 'w' ? scoreToNumber(line.score) : -scoreToNumber(line.score);
  if (value > 150) return 'text-[#7fce6b]';
  if (value < -150) return 'text-[#e5484d]';
  return 'text-[var(--text-secondary)]';
}

export function EngineLines({
  lines,
  turn,
  thinking,
  depth,
  onPlayMove,
  className,
}: {
  lines: readonly EngineLine[];
  turn: Color;
  thinking: boolean;
  depth: number;
  onPlayMove?(uci: string): void;
  className?: string;
}) {
  if (lines.length === 0) {
    return (
      <div className={className}>
        {thinking ? (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-[var(--text-muted)]">
            <Spinner />
            Starting the engine…
          </div>
        ) : (
          <EmptyState title="No engine lines yet" body="Turn on live analysis to see candidate moves." icon="⚙" />
        )}
      </div>
    );
  }

  return (
    <div className={clsx('divide-y divide-white/[0.05]', className)}>
      {lines.map((line, index) => (
        <motion.div
          key={line.multipv}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.03 }}
          className="flex items-start gap-2.5 px-3 py-2"
        >
          <button
            type="button"
            disabled={!onPlayMove}
            onClick={() => onPlayMove?.(line.pv[0])}
            className={clsx(
              'shrink-0 rounded-md border border-white/[0.09] bg-black/30 px-2 py-1 font-mono text-xs font-bold tabular-nums',
              scoreTone(line, turn),
              onPlayMove ? 'cursor-pointer transition-colors hover:border-white/25 hover:bg-black/50' : '',
            )}
            title={onPlayMove ? `Play ${line.san[0] ?? line.pv[0]}` : undefined}
          >
            {formatScore(line.score)}
          </button>

          <p className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
            {(line.san.length > 0 ? line.san : line.pv).slice(0, 10).join(' ')}
          </p>

          <span className="shrink-0 pt-0.5 font-mono text-[0.62rem] text-[var(--text-muted)]">
            d{line.depth}
          </span>
        </motion.div>
      ))}

      <div className="flex items-center justify-between px-3 py-1.5 text-[0.62rem] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          {thinking ? <Spinner className="h-2.5 w-2.5" /> : <span className="h-2 w-2 rounded-full bg-[#7fce6b]" />}
          {thinking ? 'Searching' : 'Idle'}
        </span>
        <span className="font-mono tabular-nums">
          depth {lines[0]?.depth ?? 0}/{depth}
          {lines[0]?.nodes ? ` · ${(lines[0].nodes / 1000).toFixed(0)}k nodes` : ''}
        </span>
      </div>
    </div>
  );
}
