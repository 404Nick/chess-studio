'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { ExplorerMove } from '@/types';
import { bookContinuations } from '@/lib/openings';
import { useOpening } from '@/hooks/useOpening';
import { useSettings } from '@/store/settingsStore';
import { EmptyState, ErrorNote, PanelHeader, Select, Spinner } from './ui/Primitives';

function WinBar({ white, draws, black }: { white: number; draws: number; black: number }) {
  const total = Math.max(1, white + draws + black);
  const segments = [
    { key: 'w', value: (white / total) * 100, color: '#eef1f6', text: '#12151d' },
    { key: 'd', value: (draws / total) * 100, color: '#6f7788', text: '#0d1017' },
    { key: 'b', value: (black / total) * 100, color: '#2b3244', text: '#dbe3f2' },
  ];

  return (
    <div className="flex h-4 w-full overflow-hidden rounded-md bg-black/40">
      {segments.map((segment) => (
        <motion.div
          key={segment.key}
          className="flex items-center justify-center overflow-hidden text-[0.58rem] font-bold tabular-nums"
          style={{ background: segment.color, color: segment.text }}
          animate={{ width: `${segment.value}%` }}
          transition={{ type: 'spring', stiffness: 150, damping: 24 }}
        >
          {segment.value >= 13 ? `${segment.value.toFixed(0)}%` : ''}
        </motion.div>
      ))}
    </div>
  );
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function MoveRow({ move, total, onPlay }: { move: ExplorerMove; total: number; onPlay(uci: string): void }) {
  const share = total > 0 ? (move.total / total) * 100 : 0;

  return (
    <button
      type="button"
      onClick={() => onPlay(move.uci)}
      className="grid w-full grid-cols-[3.4rem_3.2rem_1fr] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="font-mono text-xs font-semibold text-white">{move.san}</span>
      <span className="font-mono text-[0.68rem] tabular-nums text-[var(--text-muted)]" title={`${move.total} games`}>
        {formatCount(move.total)}
        <span className="ml-1 opacity-60">{share >= 1 ? `${share.toFixed(0)}%` : ''}</span>
      </span>
      <WinBar white={move.white} draws={move.draws} black={move.black} />
    </button>
  );
}

export function OpeningBook({
  sanMoves,
  fen,
  onPlayUci,
  onPlaySan,
}: {
  sanMoves: readonly string[];
  fen: string;
  onPlayUci(uci: string): void;
  onPlaySan(san: string): void;
}) {
  const db = useSettings((state) => state.explorerDb);
  const setSetting = useSettings((state) => state.set);
  const { entry, stats, loading, error } = useOpening(sanMoves, fen, db);

  const localNext = useMemo(() => bookContinuations(sanMoves).slice(0, 8), [sanMoves]);

  const displayName = stats?.opening?.name ?? entry?.name ?? null;
  const displayEco = stats?.opening?.eco ?? entry?.eco ?? null;

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader
        title="Opening explorer"
        subtitle={displayName ? `${displayEco ? `${displayEco} · ` : ''}${displayName}` : 'Out of book'}
        actions={
          <Select
            value={db}
            onChange={(value) => setSetting('explorerDb', value)}
            options={[
              { value: 'lichess', label: 'Lichess players' },
              { value: 'masters', label: 'Masters' },
            ]}
            className="w-36"
            aria-label="Opening database"
          />
        }
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {displayName ? (
          <motion.div
            key={displayName}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-[rgba(110,168,254,0.12)] to-transparent px-3 py-2.5"
          >
            <div className="flex items-baseline gap-2">
              {displayEco ? <span className="chip font-mono">{displayEco}</span> : null}
              <span className="text-sm font-semibold text-white">{displayName}</span>
            </div>
            {sanMoves.length > 0 ? (
              <p className="mt-1 font-mono text-[0.68rem] text-[var(--text-muted)]">
                {sanMoves.slice(0, 12).join(' ')}
                {sanMoves.length > 12 ? ' …' : ''}
              </p>
            ) : null}
          </motion.div>
        ) : null}

        {stats && stats.total > 0 ? (
          <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="stat-label">Results in this position</span>
              <span className="font-mono text-[0.68rem] text-[var(--text-muted)]">
                {formatCount(stats.total)} games
              </span>
            </div>
            <WinBar white={stats.white} draws={stats.draws} black={stats.black} />
          </div>
        ) : null}

        {error ? <ErrorNote>{error} Showing the offline book instead.</ErrorNote> : null}

        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
            <span className="panel-title">Continuations</span>
            {loading ? <Spinner /> : null}
          </div>

          {stats && stats.moves.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {stats.moves.map((move) => (
                <MoveRow key={move.uci} move={move} total={stats.total} onPlay={onPlayUci} />
              ))}
            </div>
          ) : localNext.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {localNext.map((item) => (
                <button
                  key={`${item.san}-${item.entry.eco}`}
                  type="button"
                  onClick={() => onPlaySan(item.san)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span className="w-14 font-mono text-xs font-semibold text-white">{item.san}</span>
                  <span className="chip font-mono">{item.entry.eco}</span>
                  <span className="truncate text-xs text-[var(--text-secondary)]">{item.entry.name}</span>
                </button>
              ))}
            </div>
          ) : loading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="skeleton h-5 w-full" />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No book moves here"
              body="This position has left both the offline book and the explorer database."
              icon="❧"
            />
          )}
        </div>

        {stats && stats.topGames.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
            <div className="border-b border-white/[0.06] px-3 py-1.5">
              <span className="panel-title">Notable games</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {stats.topGames.map((game) => (
                <a
                  key={game.id}
                  href={`https://lichess.org/${game.id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/[0.06]"
                >
                  <span className="min-w-0 truncate text-[var(--text-secondary)]">
                    {game.white} <span className="text-[var(--text-muted)]">vs</span> {game.black}
                  </span>
                  <span className="shrink-0 font-mono text-[0.66rem] text-[var(--text-muted)]">
                    {game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '½-½'}
                    {game.year ? ` · ${game.year}` : ''}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
