'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef } from 'react';
import type { Line, MoveNode } from '@/types';
import { moveNumberFor } from '@/lib/chess/line';
import { useTranslation } from '@/lib/i18n';
import { MoveQualityBadge } from './MoveQualityBadge';
import { EmptyState } from './ui/Primitives';

interface Row {
  readonly number: number;
  readonly white: { node: MoveNode; index: number } | null;
  readonly black: { node: MoveNode; index: number } | null;
}

function buildRows(line: Line): Row[] {
  const rows: Row[] = [];

  line.moves.forEach((node, index) => {
    const number = moveNumberFor(node);
    const last = rows[rows.length - 1];

    if (node.color === 'w' || !last || last.number !== number || last.black) {
      rows.push({
        number,
        white: node.color === 'w' ? { node, index } : null,
        black: node.color === 'b' ? { node, index } : null,
      });
    } else {
      rows[rows.length - 1] = { ...last, black: { node, index } };
    }
  });

  return rows;
}

function MoveCell({
  entry,
  active,
  showBadges,
  onSelect,
}: {
  entry: { node: MoveNode; index: number } | null;
  active: boolean;
  showBadges: boolean;
  onSelect(index: number): void;
}) {
  if (!entry) return <span className="px-2 py-1 text-[var(--text-muted)]">…</span>;

  const { node, index } = entry;

  return (
    <button
      type="button"
      data-active={active || undefined}
      onClick={() => onSelect(index)}
      className={clsx(
        'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono text-[0.82rem] transition-colors',
        active
          ? 'bg-[rgba(110,168,254,0.18)] text-white shadow-[inset_0_0_0_1px_rgba(110,168,254,0.4)]'
          : 'text-[var(--text-primary)] hover:bg-white/[0.06]',
      )}
    >
      <span className="truncate">{node.san}</span>
      {showBadges && node.assessment ? (
        <MoveQualityBadge classification={node.assessment.classification} size={14} />
      ) : null}
      {node.comment ? <span className="text-[var(--accent)]" title={node.comment}>✎</span> : null}
    </button>
  );
}

export function MoveList({
  line,
  onSelect,
  showBadges = true,
  className,
}: {
  line: Line;
  onSelect(index: number): void;
  showBadges?: boolean;
  className?: string;
}) {
  const rows = useMemo(() => buildRows(line), [line]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const active = containerRef.current?.querySelector('[data-active]');
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [line.cursor]);

  if (line.moves.length === 0) {
    return <EmptyState title={t('moves.none')} body={t('moves.noneBody')} icon="♟" />;
  }

  const activeNode = line.cursor >= 0 ? line.moves[line.cursor] : null;

  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5">
          {rows.map((row) => (
            <div key={`${row.number}-${row.white?.index ?? 'b'}`} className="grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1">
              <span className="select-none text-right font-mono text-[0.72rem] text-[var(--text-muted)]">
                {row.number}.
              </span>
              <MoveCell
                entry={row.white}
                active={row.white?.index === line.cursor}
                showBadges={showBadges}
                onSelect={onSelect}
              />
              <MoveCell
                entry={row.black}
                active={row.black?.index === line.cursor}
                showBadges={showBadges}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      </div>

      {activeNode?.comment ? (
        <div className="border-t border-white/[0.06] px-3 py-2 text-xs italic leading-relaxed text-[var(--text-secondary)]">
          {activeNode.comment}
        </div>
      ) : null}
    </div>
  );
}
