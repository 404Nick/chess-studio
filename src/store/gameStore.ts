'use client';

import { create } from 'zustand';
import type {
  BoardShape,
  GameHeaders,
  GameReview,
  Line,
  MoveAssessment,
  MoveNode,
  RemoteGame,
  ReviewProgress,
} from '@/types';
import { START_FEN } from '@/lib/chess/fen';
import {
  type MoveInput,
  chessAtCursor,
  currentFen,
  deleteFrom,
  emptyLine,
  goTo,
  parsePgn,
  playMove,
  updateNode,
} from '@/lib/chess/line';

export interface GameState {
  line: Line;
  headers: GameHeaders;
  orientation: 'white' | 'black';
  /** Shapes attached to the starting position (moves carry their own). */
  startShapes: readonly BoardShape[];
  review: GameReview | null;
  reviewProgress: ReviewProgress;
  source: RemoteGame | null;
  /** Ply index of the move whose classification badge should animate in. */
  badgePly: number | null;

  /* actions */
  reset(startFen?: string): void;
  loadLine(line: Line, headers?: GameHeaders, source?: RemoteGame | null): void;
  loadPgn(pgn: string, source?: RemoteGame | null): boolean;
  play(input: MoveInput | string): MoveNode | null;
  navigate(index: number): void;
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  truncateFrom(index: number): void;
  flip(): void;
  setComment(index: number, comment: string): void;
  setShapes(index: number, shapes: readonly BoardShape[]): void;
  toggleHighlight(index: number, square: BoardShape): void;
  clearShapes(index: number): void;
  setAssessment(index: number, assessment: MoveAssessment): void;
  applyReview(line: Line, review: GameReview): void;
  setReviewProgress(progress: ReviewProgress): void;
  clearBadge(): void;
  setHeaders(headers: GameHeaders): void;
}

const IDLE_PROGRESS: ReviewProgress = { done: 0, total: 0, running: false };

/**
 * Shared empty array. Selectors must return referentially stable values — zustand v5
 * compares with `Object.is`, so returning a fresh `[]` would re-render forever.
 */
const NO_SHAPES: readonly BoardShape[] = [];

export const useGame = create<GameState>()((set, get) => ({
  line: emptyLine(START_FEN),
  headers: {},
  orientation: 'white',
  startShapes: [],
  review: null,
  reviewProgress: IDLE_PROGRESS,
  source: null,
  badgePly: null,

  reset: (startFen = START_FEN) =>
    set({
      line: emptyLine(startFen),
      headers: {},
      startShapes: [],
      review: null,
      reviewProgress: IDLE_PROGRESS,
      source: null,
      badgePly: null,
    }),

  loadLine: (line, headers = {}, source = null) =>
    set({
      line,
      headers,
      source,
      startShapes: [],
      review: null,
      reviewProgress: IDLE_PROGRESS,
      badgePly: null,
    }),

  loadPgn: (pgn, source = null) => {
    const parsed = parsePgn(pgn);
    if (parsed.line.moves.length === 0 && parsed.line.startFen === START_FEN) return false;
    get().loadLine(parsed.line, parsed.headers, source);
    return true;
  },

  play: (input) => {
    const result = playMove(get().line, input);
    if (!result) return null;
    set({ line: result.line, badgePly: null, review: null });
    return result.node;
  },

  navigate: (index) => set({ line: goTo(get().line, index), badgePly: null }),
  first: () => set({ line: goTo(get().line, -1), badgePly: null }),
  previous: () => set({ line: goTo(get().line, get().line.cursor - 1), badgePly: null }),
  next: () => set({ line: goTo(get().line, get().line.cursor + 1), badgePly: null }),
  last: () => set({ line: goTo(get().line, get().line.moves.length - 1), badgePly: null }),

  truncateFrom: (index) => set({ line: deleteFrom(get().line, index), review: null }),

  flip: () => set({ orientation: get().orientation === 'white' ? 'black' : 'white' }),

  setComment: (index, comment) => {
    if (index < 0) return;
    set({ line: updateNode(get().line, index, { comment }) });
  },

  setShapes: (index, shapes) => {
    if (index < 0) {
      set({ startShapes: shapes });
      return;
    }
    set({ line: updateNode(get().line, index, { shapes }) });
  },

  toggleHighlight: (index, shape) => {
    const existing = shapesAt(get(), index);
    const match = existing.findIndex(
      (item) => item.kind === shape.kind && item.from === shape.from && item.to === shape.to,
    );
    const nextShapes =
      match >= 0
        ? existing.filter((_, i) => i !== match)
        : [...existing.filter((item) => !(item.kind === 'highlight' && item.from === shape.from)), shape];
    get().setShapes(index, nextShapes);
  },

  clearShapes: (index) => get().setShapes(index, []),

  setAssessment: (index, assessment) => {
    if (index < 0) return;
    set({ line: updateNode(get().line, index, { assessment }), badgePly: index });
  },

  applyReview: (line, review) =>
    set({ line, review, reviewProgress: IDLE_PROGRESS, badgePly: null }),

  setReviewProgress: (progress) => set({ reviewProgress: progress }),

  clearBadge: () => set({ badgePly: null }),

  setHeaders: (headers) => set({ headers: { ...get().headers, ...headers } }),
}));

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function fenOf(state: GameState): string {
  return currentFen(state.line);
}

export function currentNode(state: GameState): MoveNode | null {
  return state.line.cursor >= 0 ? state.line.moves[state.line.cursor] : null;
}

export function shapesAt(state: GameState, index: number): readonly BoardShape[] {
  if (index < 0) return state.startShapes;
  return state.line.moves[index]?.shapes ?? NO_SHAPES;
}

export function currentShapes(state: GameState): readonly BoardShape[] {
  return shapesAt(state, state.line.cursor);
}

/**
 * SAN moves up to and including the cursor — what the opening book should match.
 * Not safe to use directly as a zustand selector (it allocates); derive it with
 * `useMemo` from the `line` instead.
 */
export function sanUpToCursor(line: Line): string[] {
  return line.moves.slice(0, line.cursor + 1).map((move) => move.san);
}

export function isGameOver(state: GameState): boolean {
  return chessAtCursor(state.line).isGameOver();
}
