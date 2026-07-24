'use client';

import { type ReactNode, useCallback, useRef, useState } from 'react';
import type { GameHeaders, Line } from '@/types';
import { downloadText, lineToPgn, safeFilename } from '@/lib/chess/pgn';
import { currentFen } from '@/lib/chess/line';
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
  return (
    <div className="flex items-center gap-1.5">
      <Button icon onClick={onFirst} disabled={!canPrevious} title="First move (Home)" aria-label="First move">
        ⏮
      </Button>
      <Button icon onClick={onPrevious} disabled={!canPrevious} title="Previous move (←)" aria-label="Previous move">
        ◀
      </Button>
      <Button icon onClick={onNext} disabled={!canNext} title="Next move (→)" aria-label="Next move">
        ▶
      </Button>
      <Button icon onClick={onLast} disabled={!canNext} title="Last move (End)" aria-label="Last move">
        ⏭
      </Button>
      <div className="mx-1 h-6 w-px bg-white/10" />
      <Button icon onClick={onFlip} title="Flip board (F)" aria-label="Flip board">
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
  line,
  headers,
  onImportPgn,
  onSetFen,
  filename = 'analysis',
  includeAnalysis = true,
}: {
  line: Line;
  headers: GameHeaders;
  onImportPgn(pgn: string): void;
  onSetFen(fen: string): void;
  filename?: string;
  includeAnalysis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [copied, copy] = useCopyFeedback();

  const pgn = () => lineToPgn(line, headers, { includeComments: true, includeAnalysis });

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
        <Button onClick={() => copy('fen', currentFen(line))}>
          {copied === 'fen' ? '✓ Copied' : 'Copy FEN'}
        </Button>
        <Button onClick={() => copy('pgn', pgn())}>{copied === 'pgn' ? '✓ Copied' : 'Copy PGN'}</Button>
        <Button onClick={() => downloadText(`${safeFilename(filename)}.pgn`, pgn())}>Download PGN</Button>
        <Button variant={open ? 'primary' : 'default'} onClick={() => setOpen((value) => !value)}>
          Import…
        </Button>
      </div>

      {open ? (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/25 p-2.5">
          <textarea
            className="input h-28 resize-none font-mono text-xs"
            placeholder="Paste a PGN or a FEN here…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!text.trim()}>
              Load
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
