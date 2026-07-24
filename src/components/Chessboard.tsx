'use client';

import { Chess } from 'chess.js';
import { AnimatePresence } from 'framer-motion';
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BoardShape, BoardTheme, Color, MoveClass, PieceStyleId, PieceSymbol, Square } from '@/types';
import { FILES } from '@/lib/chess/board';
import { parseUci } from '@/lib/chess/line';
import { DEFAULT_SHAPE_COLOR } from '@/lib/theme/boardThemes';
import { BoardQualityBadge } from '@/components/MoveQualityBadge';
import { type ArrowTuple, ChessboardLib } from './board/ChessboardLib';
import { PromotionOverlay } from './board/PromotionOverlay';
import { buildCustomPieces } from './board/pieces';

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface BoardSurfaceProps {
  fen: string;
  orientation: 'white' | 'black';
  theme: BoardTheme;
  pieceStyle: PieceStyleId;
  /** Attempt a move. Return true when it was accepted. */
  onMove?(move: BoardMove): boolean;
  /** Free placement mode for the position editor — bypasses legality checks. */
  onFreeMove?(from: Square, to: Square): boolean;
  /**
   * Called before the normal selection logic on every square click.
   * Return true to consume the click (used by the editor's stamp brush).
   */
  onSquareTap?(square: Square): boolean;
  /** Called when a palette piece is dropped onto a square (HTML5 drag & drop). */
  onExternalDrop?(square: Square, payload: string): void;
  lastMove?: { from: Square; to: Square } | null;
  shapes: readonly BoardShape[];
  onShapesChange?(shapes: BoardShape[]): void;
  shapeColor?: string;
  /** UCI move to render as the engine's suggestion. */
  bestMove?: string | null;
  badge?: { square: Square; classification: MoveClass } | null;
  showCoordinates?: boolean;
  showLegalMoves?: boolean;
  animationMs?: number;
  interactive?: boolean;
  className?: string;
}

const BEST_MOVE_ARROW_COLOR = 'rgba(110, 168, 254, 0.75)';

/** `useLayoutEffect` warns during SSR; fall back to `useEffect` on the server. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function squareRect(square: Square, orientation: 'white' | 'black', size: number) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const x = orientation === 'white' ? file * size : (7 - file) * size;
  const y = orientation === 'white' ? (8 - rank) * size : (rank - 1) * size;
  return { x, y };
}

function pointToSquare(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  orientation: 'white' | 'black',
): Square | null {
  const size = rect.width / 8;
  const col = Math.floor((clientX - rect.left) / size);
  const row = Math.floor((clientY - rect.top) / size);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'white' ? col : 7 - col;
  const rank = orientation === 'white' ? 8 - row : row + 1;
  return `${FILES[file]}${rank}` as Square;
}

export function BoardSurface({
  fen,
  orientation,
  theme,
  pieceStyle,
  onMove,
  onFreeMove,
  onSquareTap,
  onExternalDrop,
  lastMove,
  shapes,
  onShapesChange,
  shapeColor = DEFAULT_SHAPE_COLOR,
  bestMove,
  badge,
  showCoordinates = true,
  showLegalMoves = true,
  animationMs = 220,
  interactive = true,
  className,
}: BoardSurfaceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [dragOverSquare, setDragOverSquare] = useState<Square | null>(null);
  // Right-drag arrow drawing is handled entirely here rather than by react-chessboard,
  // whose internal arrow state fights a controlled `customArrows` prop and loops.
  const arrowStartRef = useRef<Square | null>(null);
  const [arrowPreview, setArrowPreview] = useState<{ from: Square; to: Square } | null>(null);

  /* ---------------- sizing ---------------- */

  useIsomorphicLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return undefined;

    const measure = () => setBoardWidth(Math.max(220, Math.floor(element.clientWidth)));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const squareSize = boardWidth / 8;

  /* ---------------- position state ---------------- */

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [fen]);

  const legalTargets = useMemo(() => {
    if (!selected || !chess || !showLegalMoves || onFreeMove) return [];
    try {
      return chess.moves({ square: selected, verbose: true }).map((move) => move.to as Square);
    } catch {
      return [];
    }
  }, [selected, chess, showLegalMoves, onFreeMove]);

  const checkedSquare = useMemo(() => {
    if (!chess || !chess.isCheck()) return null;
    const turn = chess.turn();
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) return cell.square as Square;
      }
    }
    return null;
  }, [chess]);

  /* ---------------- moving ---------------- */

  const needsPromotion = useCallback(
    (from: Square, to: Square): boolean => {
      if (!chess || onFreeMove) return false;
      const piece = chess.get(from);
      if (!piece || piece.type !== 'p') return false;
      const targetRank = to[1];
      return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
    },
    [chess, onFreeMove],
  );

  const attemptMove = useCallback(
    (from: Square, to: Square): boolean => {
      if (!interactive) return false;
      if (onFreeMove) return onFreeMove(from, to);
      if (!onMove) return false;

      if (needsPromotion(from, to)) {
        const color = chess?.get(from)?.color ?? 'w';
        setPending({ from, to, color });
        return false;
      }
      return onMove({ from, to });
    },
    [interactive, onFreeMove, onMove, needsPromotion, chess],
  );

  const handlePieceDrop = useCallback(
    (from: Square, to: Square): boolean => {
      setSelected(null);
      return attemptMove(from, to);
    },
    [attemptMove],
  );

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!interactive) return;
      if (onSquareTap?.(square)) {
        setSelected(null);
        return;
      }

      if (selected && selected !== square) {
        if (attemptMove(selected, square)) {
          setSelected(null);
          return;
        }
      }

      if (onFreeMove) {
        setSelected(selected === square ? null : square);
        return;
      }

      const piece = chess?.get(square);
      if (piece && chess && piece.color === chess.turn()) setSelected(square);
      else setSelected(null);
    },
    [interactive, selected, attemptMove, chess, onFreeMove, onSquareTap],
  );

  const resolvePromotion = useCallback(
    (piece: PieceSymbol) => {
      if (!pending || !onMove) {
        setPending(null);
        return;
      }
      onMove({ from: pending.from, to: pending.to, promotion: piece });
      setPending(null);
    },
    [pending, onMove],
  );

  /* ---------------- shapes ----------------
   *
   * `customArrows` is a *fully controlled* prop: it is derived only from persisted
   * shapes, the live preview, and the engine's best move. We deliberately do NOT pass
   * `onArrowsChange` and set `areArrowsAllowed={false}`, because react-chessboard's
   * own arrow state reports `[]` every time the controlled prop changes, which would
   * otherwise feed back and loop. All drawing is handled by the pointer logic below.
   */

  const arrows = useMemo<ArrowTuple[]>(() => {
    const out: ArrowTuple[] = shapes
      .filter((shape) => shape.kind === 'arrow')
      .map((shape) => [shape.from, shape.to, shape.color] as ArrowTuple);

    if (arrowPreview && arrowPreview.from !== arrowPreview.to) {
      out.push([arrowPreview.from, arrowPreview.to, shapeColor]);
    }

    if (bestMove) {
      const parsed = parseUci(bestMove);
      if (parsed && parsed.from !== parsed.to) {
        out.push([parsed.from, parsed.to, BEST_MOVE_ARROW_COLOR]);
      }
    }
    return out;
  }, [shapes, arrowPreview, shapeColor, bestMove]);

  const toggleHighlight = useCallback(
    (square: Square) => {
      if (!onShapesChange) return;
      const existing = shapes.find((shape) => shape.kind === 'highlight' && shape.from === square);
      if (existing && existing.color === shapeColor) {
        onShapesChange(shapes.filter((shape) => shape !== existing));
        return;
      }
      const withoutSquare = shapes.filter(
        (shape) => !(shape.kind === 'highlight' && shape.from === square),
      );
      onShapesChange([...withoutSquare, { from: square, to: square, color: shapeColor, kind: 'highlight' }]);
    },
    [onShapesChange, shapes, shapeColor],
  );

  const toggleArrow = useCallback(
    (from: Square, to: Square) => {
      if (!onShapesChange) return;
      const existing = shapes.find(
        (shape) => shape.kind === 'arrow' && shape.from === from && shape.to === to,
      );
      if (existing && existing.color === shapeColor) {
        onShapesChange(shapes.filter((shape) => shape !== existing));
        return;
      }
      const withoutSame = shapes.filter(
        (shape) => !(shape.kind === 'arrow' && shape.from === from && shape.to === to),
      );
      onShapesChange([...withoutSame, { from, to, color: shapeColor, kind: 'arrow' }]);
    },
    [onShapesChange, shapes, shapeColor],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 2 || !onShapesChange) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      arrowStartRef.current = pointToSquare(event.clientX, event.clientY, rect, orientation);
    },
    [onShapesChange, orientation],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = arrowStartRef.current;
      if (!start) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const current = pointToSquare(event.clientX, event.clientY, rect, orientation);
      setArrowPreview(current && current !== start ? { from: start, to: current } : null);
    },
    [orientation],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = arrowStartRef.current;
      arrowStartRef.current = null;
      setArrowPreview(null);
      if (event.button !== 2 || !start) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const end = pointToSquare(event.clientX, event.clientY, rect, orientation);
      if (!end) return;
      if (end === start) toggleHighlight(start);
      else toggleArrow(start, end);
    },
    [orientation, toggleHighlight, toggleArrow],
  );

  /* ---------------- square styling ---------------- */

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};

    if (lastMove) {
      styles[lastMove.from] = { background: theme.lastMove };
      styles[lastMove.to] = { background: theme.lastMove };
    }

    for (const shape of shapes) {
      if (shape.kind !== 'highlight') continue;
      styles[shape.from] = {
        ...styles[shape.from],
        boxShadow: `inset 0 0 0 4px ${shape.color}`,
        background: `${shape.color}33`,
      };
    }

    if (checkedSquare) {
      styles[checkedSquare] = {
        ...styles[checkedSquare],
        background: `radial-gradient(circle at center, ${theme.check} 12%, transparent 72%)`,
      };
    }

    if (selected) {
      styles[selected] = { ...styles[selected], background: theme.selected };
    }

    for (const target of legalTargets) {
      const occupied = Boolean(chess?.get(target));
      styles[target] = {
        ...styles[target],
        background: occupied
          ? `radial-gradient(circle at center, transparent 54%, ${theme.selected} 56%)`
          : `radial-gradient(circle at center, ${theme.selected} 20%, transparent 22%)`,
      };
    }

    if (dragOverSquare) {
      styles[dragOverSquare] = {
        ...styles[dragOverSquare],
        boxShadow: 'inset 0 0 0 3px rgba(110,168,254,0.9)',
      };
    }

    return styles;
  }, [lastMove, shapes, checkedSquare, selected, legalTargets, chess, theme, dragOverSquare]);

  const customPieces = useMemo(() => buildCustomPieces(pieceStyle), [pieceStyle]);

  /* ---------------- external (palette) drag & drop ---------------- */

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!onExternalDrop) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDragOverSquare(pointToSquare(event.clientX, event.clientY, rect, orientation));
    },
    [onExternalDrop, orientation],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!onExternalDrop) return;
      event.preventDefault();
      setDragOverSquare(null);
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const square = pointToSquare(event.clientX, event.clientY, rect, orientation);
      const payload = event.dataTransfer.getData('text/plain');
      if (square && payload) onExternalDrop(square, payload);
    },
    [onExternalDrop, orientation],
  );

  const badgePosition = useMemo(() => {
    if (!badge) return null;
    const { x, y } = squareRect(badge.square, orientation, squareSize);
    const size = Math.max(18, squareSize * 0.44);
    return { x: x + squareSize - size * 0.62, y: y - size * 0.26, size };
  }, [badge, orientation, squareSize]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ position: 'relative', width: '100%' }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOverSquare(null)}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ChessboardLib
        id="main-board"
        position={fen}
        boardWidth={boardWidth}
        boardOrientation={orientation}
        animationDuration={animationMs}
        arePiecesDraggable={interactive}
        // Arrow drawing is handled by this component's pointer logic, not the library.
        areArrowsAllowed={false}
        showBoardNotation={showCoordinates}
        snapToCursor={false}
        customArrows={arrows}
        customArrowColor={shapeColor}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        onPromotionCheck={() => false}
        customSquareStyles={squareStyles}
        customPieces={customPieces}
        customBoardStyle={{
          borderRadius: '12px',
          boxShadow: `0 30px 70px -34px rgba(0,0,0,0.95), 0 0 0 1px ${theme.border}${
            theme.glow ? `, 0 0 46px -18px ${theme.glow}` : ''
          }`,
        }}
        customLightSquareStyle={{
          backgroundColor: theme.light,
          backgroundImage: theme.lightTexture,
        }}
        customDarkSquareStyle={{
          backgroundColor: theme.dark,
          backgroundImage: theme.darkTexture,
        }}
        customDropSquareStyle={{ boxShadow: 'inset 0 0 0 4px rgba(110,168,254,0.7)' }}
      />

      <AnimatePresence>
        {badge && badgePosition ? (
          <BoardQualityBadge
            classification={badge.classification}
            size={badgePosition.size}
            x={badgePosition.x}
            y={badgePosition.y}
          />
        ) : null}
      </AnimatePresence>

      <PromotionOverlay
        open={Boolean(pending)}
        color={pending?.color ?? 'w'}
        onSelect={resolvePromotion}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
