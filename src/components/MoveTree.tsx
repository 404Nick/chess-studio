'use client';

import clsx from 'clsx';
import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import type { GameTree, MoveNode } from '@/types';
import { fenFullmove } from '@/lib/chess/fen';
import { isMainline } from '@/lib/chess/tree';
import { useTranslation } from '@/lib/i18n';
import { MoveQualityBadge } from './MoveQualityBadge';
import { EmptyState } from './ui/Primitives';

function numberPrefix(node: MoveNode, forceNumber: boolean): string {
  const n = fenFullmove(node.fenBefore);
  if (node.color === 'w') return `${n}.`;
  if (forceNumber) return `${n}…`;
  return '';
}

export function MoveTree({
  tree,
  onSelect,
  onPromote,
  onDelete,
  showBadges = true,
  className,
}: {
  tree: GameTree;
  onSelect(nodeId: string): void;
  onPromote?(nodeId: string): void;
  onDelete?(nodeId: string): void;
  showBadges?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [tree.cursor]);

  if (tree.rootChildren.length === 0) {
    return <EmptyState title={t('moves.none')} body={t('moves.noneBody')} icon="♟" />;
  }

  const moveButton = (nodeId: string, forceNumber: boolean, variation: boolean): ReactNode => {
    const node = tree.nodes[nodeId].move;
    const active = tree.cursor === nodeId;
    const prefix = numberPrefix(node, forceNumber);
    return (
      <button
        key={nodeId}
        type="button"
        data-active={active || undefined}
        onClick={() => onSelect(nodeId)}
        className={clsx(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono transition-colors',
          variation ? 'text-[0.74rem]' : 'text-[0.82rem]',
          active
            ? 'bg-[rgba(110,168,254,0.22)] text-white shadow-[inset_0_0_0_1px_rgba(110,168,254,0.45)]'
            : variation
              ? 'text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-secondary)]'
              : 'text-[var(--text-primary)] hover:bg-white/[0.06]',
        )}
      >
        {prefix ? <span className="opacity-60">{prefix}</span> : null}
        <span>{node.san}</span>
        {showBadges && node.assessment ? (
          <MoveQualityBadge classification={node.assessment.classification} size={13} />
        ) : null}
        {node.comment ? <span className="text-[var(--accent)]">✎</span> : null}
      </button>
    );
  };

  /** Renders a continuation (mainline + nested variations) as inline flowing tokens. */
  const renderContinuation = (childIds: readonly string[], forceNumber: boolean, variation: boolean): ReactNode[] => {
    if (childIds.length === 0) return [];
    const [mainId, ...variationIds] = childIds;
    const out: ReactNode[] = [moveButton(mainId, forceNumber, variation)];

    for (const variationId of variationIds) {
      out.push(
        <span key={`var-${variationId}`} className="mx-0.5 text-[var(--text-muted)]">
          <span className="opacity-50">(</span>
          {renderContinuation([variationId], true, true)}
          <span className="opacity-50">)</span>
        </span>,
      );
    }

    out.push(
      <Fragment key={`cont-${mainId}`}>
        {renderContinuation(tree.nodes[mainId].children, variationIds.length > 0, variation)}
      </Fragment>,
    );
    return out;
  };

  const activeId = tree.cursor;
  const activeNode = activeId ? tree.nodes[activeId]?.move : null;
  const canPromote = activeId ? !isMainline(tree, activeId) : false;

  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-2 leading-7">
        <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
          {renderContinuation(tree.rootChildren, true, false)}
        </div>
      </div>

      {activeId && activeNode ? (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-1.5">
          <span className="truncate text-xs italic text-[var(--text-secondary)]">{activeNode.comment ?? ''}</span>
          <div className="flex shrink-0 gap-2">
            {canPromote && onPromote ? (
              <button
                type="button"
                onClick={() => onPromote(activeId)}
                className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
              >
                {t('moves.promote')}
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(activeId)}
                className="text-[0.68rem] text-[var(--text-muted)] hover:text-[#e5484d]"
              >
                {t('moves.delete')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
