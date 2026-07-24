'use client';

import clsx from 'clsx';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import type { BoardTheme, Color, PieceStyleId, PieceSymbol, Square } from '@/types';
import { boardFromFen, squareToIndex } from '@/lib/chess/board';
import {
  EMPTY_FEN,
  START_FEN,
  buildFen,
  enPassantOptions,
  parseFen,
  placementFromBoard,
  sanitiseCastling,
  validateFen,
} from '@/lib/chess/fen';
import { BoardSurface } from './Chessboard';
import { PieceGlyph, type PieceKey } from './board/pieces';
import { Button, ErrorNote, PanelHeader, Select } from './ui/Primitives';

const PALETTE: PieceKey[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

const CASTLING_FLAGS: { flag: string; label: string }[] = [
  { flag: 'K', label: 'White O-O' },
  { flag: 'Q', label: 'White O-O-O' },
  { flag: 'k', label: 'Black O-O' },
  { flag: 'q', label: 'Black O-O-O' },
];

type Brush = PieceKey | 'erase' | null;

/** The editor never shows annotations, so hand the board a stable empty list. */
const NO_SHAPES: never[] = [];

export function StudioEditor({
  fen,
  onChange,
  onApply,
  onCancel,
  theme,
  pieceStyle,
  orientation,
}: {
  fen: string;
  onChange(next: string): void;
  onApply(next: string): void;
  onCancel(): void;
  theme: BoardTheme;
  pieceStyle: PieceStyleId;
  orientation: 'white' | 'black';
}) {
  const [brush, setBrush] = useState<Brush>(null);
  const [fenDraft, setFenDraft] = useState(fen);

  const parts = useMemo(() => parseFen(fen), [fen]);
  const board = useMemo(() => boardFromFen(fen), [fen]);
  const validation = useMemo(() => validateFen(fen), [fen]);
  const epChoices = useMemo(() => enPassantOptions(board, parts.turn), [board, parts.turn]);

  /** Rebuilds the FEN after mutating the board, keeping castling rights consistent. */
  const commitBoard = useCallback(
    (mutate: (draft: ReturnType<typeof boardFromFen>) => void) => {
      const draft = boardFromFen(fen);
      mutate(draft);
      const placement = placementFromBoard(draft);
      const next = buildFen({
        ...parts,
        placement,
        castling: sanitiseCastling(draft, parts.castling),
        enPassant: '-',
      });
      setFenDraft(next);
      onChange(next);
    },
    [fen, parts, onChange],
  );

  const setPart = useCallback(
    (patch: Partial<ReturnType<typeof parseFen>>) => {
      const next = buildFen({ ...parts, ...patch });
      setFenDraft(next);
      onChange(next);
    },
    [parts, onChange],
  );

  const placeAt = useCallback(
    (square: Square, payload: Brush) => {
      if (!payload) return;
      commitBoard((draft) => {
        const index = squareToIndex(square);
        if (payload === 'erase') {
          draft[index] = null;
          return;
        }
        draft[index] = {
          color: payload[0] as Color,
          type: payload[1].toLowerCase() as PieceSymbol,
        };
      });
    },
    [commitBoard],
  );

  const handleFreeMove = useCallback(
    (from: Square, to: Square) => {
      commitBoard((draft) => {
        const fromIndex = squareToIndex(from);
        const toIndex = squareToIndex(to);
        draft[toIndex] = draft[fromIndex];
        draft[fromIndex] = null;
      });
      return true;
    },
    [commitBoard],
  );

  /** With a brush armed, a plain click stamps (or erases) instead of selecting. */
  const handleSquareTap = useCallback(
    (square: Square) => {
      if (!brush) return false;
      placeAt(square, brush);
      return true;
    },
    [brush, placeAt],
  );

  const toggleCastling = useCallback(
    (flag: string) => {
      const has = parts.castling.includes(flag);
      const next = has ? parts.castling.replace(flag, '') : `${parts.castling.replace('-', '')}${flag}`;
      setPart({ castling: sanitiseCastling(board, next) });
    },
    [parts.castling, board, setPart],
  );

  const applyFenDraft = useCallback(() => {
    const check = validateFen(fenDraft);
    if (!check.ok) return;
    onChange(fenDraft.trim());
  }, [fenDraft, onChange]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ------------------------------- board ------------------------------- */}
      <div className="space-y-3">
        <BoardSurface
          fen={fen}
          orientation={orientation}
          theme={theme}
          pieceStyle={pieceStyle}
          shapes={NO_SHAPES}
          onFreeMove={handleFreeMove}
          onSquareTap={handleSquareTap}
          onExternalDrop={(square, payload) => placeAt(square, payload as Brush)}
          showLegalMoves={false}
          animationMs={0}
          interactive
        />

        <p className="text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
          Drag a piece from the palette onto the board, or pick a brush and click squares. Pieces already on
          the board can be dragged between squares.
        </p>
      </div>

      {/* ------------------------------- controls ------------------------------- */}
      <div className="space-y-4">
        <div>
          <p className="stat-label mb-2">Palette</p>
          <div className="grid grid-cols-6 gap-1.5">
            {PALETTE.map((piece) => (
              <button
                key={piece}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', piece);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => setBrush(brush === piece ? null : piece)}
                className={clsx(
                  'flex aspect-square cursor-grab items-center justify-center rounded-lg border transition-all active:cursor-grabbing',
                  brush === piece
                    ? 'border-[rgba(110,168,254,0.8)] bg-[rgba(110,168,254,0.14)] shadow-glow'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/25',
                )}
                title={`${piece} — drag onto the board or click to arm the brush`}
              >
                <PieceGlyph piece={piece} size={26} style={pieceStyle} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBrush(brush === 'erase' ? null : 'erase')}
            className={clsx(
              'mt-1.5 w-full rounded-lg border py-1.5 text-xs font-medium transition-all',
              brush === 'erase'
                ? 'border-[rgba(229,72,77,0.7)] bg-[rgba(229,72,77,0.14)] text-[#ffb4b6]'
                : 'border-white/[0.08] bg-white/[0.03] text-[var(--text-secondary)] hover:border-white/25',
            )}
          >
            {brush === 'erase' ? 'Eraser active — click a square' : 'Eraser'}
          </button>
        </div>

        <div className="space-y-2">
          <Select
            label="Side to move"
            value={parts.turn}
            onChange={(value) => setPart({ turn: value as Color })}
            options={[
              { value: 'w', label: 'White to move' },
              { value: 'b', label: 'Black to move' },
            ]}
          />

          <div>
            <p className="stat-label mb-1.5">Castling rights</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CASTLING_FLAGS.map((item) => (
                <button
                  key={item.flag}
                  type="button"
                  onClick={() => toggleCastling(item.flag)}
                  className={clsx(
                    'rounded-lg border px-2 py-1.5 text-[0.68rem] font-medium transition-all',
                    parts.castling.includes(item.flag)
                      ? 'border-[rgba(110,168,254,0.6)] bg-[rgba(110,168,254,0.12)] text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-[var(--text-muted)] hover:border-white/20',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <Select
            label="En passant target"
            value={parts.enPassant}
            onChange={(value) => setPart({ enPassant: value })}
            options={[
              { value: '-', label: 'None' },
              ...epChoices.map((square) => ({ value: square, label: square })),
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            onClick={() => {
              setFenDraft(START_FEN);
              onChange(START_FEN);
            }}
          >
            Start position
          </Button>
          <Button
            onClick={() => {
              setFenDraft(EMPTY_FEN);
              onChange(EMPTY_FEN);
            }}
          >
            Clear board
          </Button>
        </div>

        <div>
          <p className="stat-label mb-1.5">FEN</p>
          <textarea
            className="input h-20 resize-none font-mono text-[0.68rem]"
            value={fenDraft}
            onChange={(event) => setFenDraft(event.target.value)}
            onBlur={applyFenDraft}
            spellCheck={false}
          />
          <Button className="mt-1.5 w-full" onClick={applyFenDraft}>
            Load this FEN
          </Button>
        </div>

        {!validation.ok ? (
          <ErrorNote>{validation.error}</ErrorNote>
        ) : !validation.playable ? (
          <div className="rounded-lg border border-[rgba(242,193,78,0.35)] bg-[rgba(242,193,78,0.10)] px-3 py-2 text-xs leading-relaxed text-[#ffe0a0]">
            The position is structurally valid but not legal to play from ({validation.error}). Fix it before
            starting a chapter here.
          </div>
        ) : null}

        <div className="flex gap-1.5">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!validation.playable}
            onClick={() => onApply(fen)}
          >
            Use position
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small wrapper that gives the editor a panel header when used as a standalone view. */
export function StudioEditorPanel(props: ComponentProps<typeof StudioEditor>) {
  return (
    <div className="panel">
      <PanelHeader
        title="Position editor"
        subtitle="Build any position, then start a chapter from it"
      />
      <div className="p-3">
        <StudioEditor {...props} />
      </div>
    </div>
  );
}
