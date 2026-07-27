'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardMove } from '@/components/Chessboard';
import type { GameTree, Square } from '@/types';
import { START_FEN } from '@/lib/chess/fen';
import {
  currentFen,
  currentNode,
  deleteNode as treeDelete,
  emptyTree,
  goToNode,
  playMove,
  promoteNode,
  toEnd,
  toPrevious,
  toStart,
} from '@/lib/chess/tree';
import { toNext } from '@/lib/chess/tree';
import { childrenOf } from '@/lib/chess/tree';
import { parsePgnToTree } from '@/lib/chess/treePgn';
import {
  type Repertoire,
  type RepertoireColor,
  deleteRepertoire,
  getSrsCards,
  listRepertoires,
  putRepertoire,
} from '@/lib/repertoire/repertoireDb';
import { collectCards, dueCards, srsByFenKey } from '@/lib/repertoire/trainer';
import { getTheme } from '@/lib/theme/boardThemes';
import { useTranslation } from '@/lib/i18n';
import { useSettings } from '@/store/settingsStore';
import { BoardControls } from '@/components/BoardControls';
import { BoardSurface } from '@/components/Chessboard';
import { MoveTree } from '@/components/MoveTree';
import { RepertoireTrainer } from '@/components/RepertoireTrainer';
import { Button, EmptyState, Panel, PanelHeader, Select } from '@/components/ui/Primitives';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface DueInfo {
  due: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

function RepertoireBuilder({
  repertoire,
  onExit,
  onSaved,
}: {
  repertoire: Repertoire;
  onExit(): void;
  onSaved(): void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);

  const [tree, setTree] = useState<GameTree>(repertoire.tree);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  // Auto-save shortly after the tree stops changing.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void putRepertoire({ ...repertoire, tree }).then(onSaved).catch(() => {});
    }, 600);
    return () => window.clearTimeout(id);
  }, [tree, repertoire, onSaved]);

  const fen = currentFen(tree);
  const node = currentNode(tree);

  const handleMove = useCallback((move: BoardMove): boolean => {
    const result = playMove(tree, move);
    if (!result) return false;
    setTree(result.tree);
    return true;
  }, [tree]);

  const runImport = useCallback(() => {
    const value = importText.trim();
    if (!value) return;
    const parsed = parsePgnToTree(value);
    if (parsed.tree.rootChildren.length > 0) setTree(parsed.tree);
    setImportText('');
    setImportOpen(false);
  }, [importText]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{repertoire.name}</p>
            <p className="text-[0.68rem] text-[var(--text-muted)]">
              {t(repertoire.color === 'white' ? 'rep.asWhite' : 'rep.asBlack')}
            </p>
          </div>
          <BoardControls
            onFirst={() => setTree(toStart(tree))}
            onPrevious={() => setTree(toPrevious(tree))}
            onNext={() => setTree(toNext(tree))}
            onLast={() => setTree(toEnd(tree))}
            onFlip={() => {}}
            canPrevious={tree.cursor !== null}
            canNext={childrenOf(tree, tree.cursor).length > 0}
          >
            <Button className="ml-1" onClick={onExit}>
              {t('rep.done')}
            </Button>
          </BoardControls>
        </div>

        <BoardSurface
          fen={fen}
          orientation={repertoire.color}
          theme={theme}
          pieceStyle={settings.pieceStyle}
          onMove={handleMove}
          lastMove={node ? { from: node.from as Square, to: node.to as Square } : null}
          shapes={[]}
          showCoordinates={settings.showCoordinates}
          showLegalMoves={settings.showLegalMoves}
          animationMs={settings.animationMs}
        />

        <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--text-muted)]">{t('rep.builderHint')}</p>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel className="flex max-h-[26rem] min-h-[16rem] flex-col overflow-hidden">
          <PanelHeader title={t('rep.lines')} subtitle={t('rep.lineCount', { n: Object.keys(tree.nodes).length })} />
          <MoveTree
            tree={tree}
            onSelect={(id) => setTree(goToNode(tree, id))}
            onPromote={(id) => setTree(promoteNode(tree, id))}
            onDelete={(id) => setTree(treeDelete(tree, id))}
            showBadges={false}
          />
        </Panel>

        <Panel className="space-y-2 p-3">
          <Button className="w-full" variant={importOpen ? 'primary' : 'default'} onClick={() => setImportOpen((v) => !v)}>
            {t('rep.importLines')}
          </Button>
          {importOpen ? (
            <div className="space-y-2">
              <textarea
                className="input h-24 resize-none font-mono text-[0.66rem]"
                placeholder={t('rep.pastePgn')}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                spellCheck={false}
              />
              <Button variant="primary" className="w-full" onClick={runImport} disabled={!importText.trim()}>
                {t('rep.loadLines')}
              </Button>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function RepertoirePage() {
  const { t } = useTranslation();
  const [reps, setReps] = useState<Repertoire[] | null>(null);
  const [dueInfo, setDueInfo] = useState<Record<string, DueInfo>>({});
  const [mode, setMode] = useState<'list' | 'build' | 'train'>('list');
  const [active, setActive] = useState<Repertoire | null>(null);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<RepertoireColor>('white');

  const refresh = useCallback(async () => {
    const all = await listRepertoires();
    setReps(all);
    const info: Record<string, DueInfo> = {};
    for (const rep of all) {
      const cards = collectCards(rep.tree, rep.color);
      const srs = srsByFenKey(rep.id, await getSrsCards(rep.id));
      info[rep.id] = { due: dueCards(cards, srs).length, total: cards.length };
    }
    setDueInfo(info);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    const name = newName.trim() || t('rep.untitled');
    const now = Date.now();
    const repertoire: Repertoire = {
      id: newId(),
      name,
      color: newColor,
      tree: emptyTree(START_FEN),
      createdAt: now,
      updatedAt: now,
    };
    await putRepertoire(repertoire);
    setNewName('');
    await refresh();
    setActive(repertoire);
    setMode('build');
  }, [newName, newColor, refresh, t]);

  const remove = useCallback(
    async (id: string) => {
      if (typeof window !== 'undefined' && !window.confirm(t('rep.deleteConfirm'))) return;
      await deleteRepertoire(id);
      await refresh();
    },
    [refresh, t],
  );

  if (active && mode === 'build') {
    return (
      <RepertoireBuilder
        repertoire={active}
        onExit={() => {
          setMode('list');
          setActive(null);
          void refresh();
        }}
        onSaved={() => {}}
      />
    );
  }

  if (active && mode === 'train') {
    return (
      <RepertoireTrainer
        repertoire={active}
        onExit={() => {
          setMode('list');
          setActive(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel className="space-y-3 p-4">
        <PanelHeader title={t('rep.title')} subtitle={t('rep.subtitle')} />
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="input max-w-xs"
            placeholder={t('rep.namePlaceholder')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Select
            value={newColor}
            onChange={(value) => setNewColor(value)}
            options={[
              { value: 'white', label: t('rep.asWhite') },
              { value: 'black', label: t('rep.asBlack') },
            ]}
          />
          <Button variant="primary" onClick={create}>
            {t('rep.create')}
          </Button>
        </div>
      </Panel>

      {reps && reps.length === 0 ? (
        <Panel>
          <EmptyState title={t('rep.emptyTitle')} body={t('rep.emptyBody')} icon="📚" />
        </Panel>
      ) : null}

      <div className="space-y-2">
        {(reps ?? []).map((rep) => {
          const info = dueInfo[rep.id];
          return (
            <Panel key={rep.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{rep.name}</p>
                <p className="text-[0.68rem] text-[var(--text-muted)]">
                  {t(rep.color === 'white' ? 'rep.asWhite' : 'rep.asBlack')}
                  {info ? ` · ${t('rep.positions', { n: info.total })}` : ''}
                  {info && info.due > 0 ? ` · ${t('rep.dueNow', { n: info.due })}` : ''}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  setActive(rep);
                  setMode('train');
                }}
                disabled={!info || info.total === 0}
              >
                {t('rep.train')}
              </Button>
              <Button
                onClick={() => {
                  setActive(rep);
                  setMode('build');
                }}
              >
                {t('rep.build')}
              </Button>
              <button
                type="button"
                onClick={() => void remove(rep.id)}
                aria-label={t('rep.delete')}
                className="text-[var(--text-muted)] transition-colors hover:text-[#e5484d]"
              >
                ✕
              </button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
