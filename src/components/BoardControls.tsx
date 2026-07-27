'use client';

import { type ReactNode, useCallback, useRef, useState } from 'react';
import type { GameHeaders, GameTree } from '@/types';
import { downloadText, safeFilename } from '@/lib/chess/pgn';
import { currentFen } from '@/lib/chess/tree';
import { treeToPgn } from '@/lib/chess/treePgn';
import { addGameFromPgn } from '@/lib/games/gamesDb';
import { useTranslation } from '@/lib/i18n';
import { Button } from './ui/Primitives';

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export interface BoardControlsProps {
  onFirst(): void;
  onPrevious(): void;
  onNext(): void;
  onLast(): void;
  onFlip(): void;
  canPrevious: boolean;
  canNext: boolean;
  children?: ReactNode;
}

export function BoardControls({
  onFirst,
  onPrevious,
  onNext,
  onLast,
  onFlip,
  canPrevious,
  canNext,
  children,
}: BoardControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <Button icon onClick={onFirst} disabled={!canPrevious} title={t('ctrl.first')} aria-label={t('ctrl.first')}>
        ⏮
      </Button>
      <Button icon onClick={onPrevious} disabled={!canPrevious} title={t('ctrl.previous')} aria-label={t('ctrl.previous')}>
        ◀
      </Button>
      <Button icon onClick={onNext} disabled={!canNext} title={t('ctrl.next')} aria-label={t('ctrl.next')}>
        ▶
      </Button>
      <Button icon onClick={onLast} disabled={!canNext} title={t('ctrl.last')} aria-label={t('ctrl.last')}>
        ⏭
      </Button>
      <div className="mx-1 h-6 w-px bg-white/10" />
      <Button icon onClick={onFlip} title={t('ctrl.flip')} aria-label={t('ctrl.flip')}>
        ⇅
      </Button>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

function useCopyFeedback(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((key: string, text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => setCopied(null));
  }, []);

  return [copied, copy];
}

export function ImportExportBar({
  tree,
  headers,
  onImportPgn,
  onSetFen,
  filename = 'analysis',
  includeAnalysis = true,
}: {
  tree: GameTree;
  headers: GameHeaders;
  onImportPgn(pgn: string): void;
  onSetFen(fen: string): void;
  filename?: string;
  includeAnalysis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, copy] = useCopyFeedback();
  const { t } = useTranslation();

  const empty = tree.rootChildren.length === 0;
  const pgn = () => treeToPgn(tree, headers, { includeComments: true, includeAnalysis });

  const save = useCallback(async () => {
    if (empty) return;
    await addGameFromPgn(treeToPgn(tree, headers, { includeComments: true, includeAnalysis }), {
      origin: 'local',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }, [tree, headers, includeAnalysis, empty]);

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    // A single-line input with 6 space-separated fields is a FEN, not a PGN.
    if (!value.includes('[') && /^[1-8pnbrqkPNBRQK/]+\s+[wb]\s/.test(value)) onSetFen(value);
    else onImportPgn(value);
    setText('');
    setOpen(false);
  }, [text, onImportPgn, onSetFen]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button onClick={() => copy('fen', currentFen(tree))}>
          {copied === 'fen' ? t('ctrl.copied') : t('ctrl.copyFen')}
        </Button>
        <Button onClick={() => copy('pgn', pgn())}>
          {copied === 'pgn' ? t('ctrl.copied') : t('ctrl.copyPgn')}
        </Button>
        <Button onClick={() => downloadText(`${safeFilename(filename)}.pgn`, pgn())}>
          {t('ctrl.downloadPgn')}
        </Button>
        <Button onClick={() => void save()} disabled={empty}>
          {saved ? t('ctrl.saved') : t('ctrl.saveLibrary')}
        </Button>
        <Button variant={open ? 'primary' : 'default'} onClick={() => setOpen((value) => !value)}>
          {t('ctrl.import')}
        </Button>
      </div>

      {open ? (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/25 p-2.5">
          <textarea
            className="input h-28 resize-none font-mono text-xs"
            placeholder={t('ctrl.pastePlaceholder')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} disabled={!text.trim()}>
              {t('common.load')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
