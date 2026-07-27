'use client';

import { create } from 'zustand';
import type {
  BoardShape,
  GameHeaders,
  GameReview,
  GameTree,
  MoveAssessment,
  MoveNode,
  RemoteGame,
  ReviewProgress,
} from '@/types';
import { START_FEN } from '@/lib/chess/fen';
import { type MoveInput } from '@/lib/chess/line';
import { parsePgnToTree } from '@/lib/chess/treePgn';
import {
  chessAtCursor,
  currentFen as treeFen,
  currentNode as treeCurrentNode,
  deleteNode as treeDeleteNode,
  emptyTree,
  goToNode,
  mainline as treeMainline,
  movesToNode,
  nodeOf,
  playMove as treePlay,
  promoteNode as treePromote,
  siblingVariation,
  toEnd,
  toNext,
  toPrevious,
  toStart,
  updateNode as treeUpdateNode,
} from '@/lib/chess/tree';

export interface GameState {
  tree: GameTree;
  headers: GameHeaders;
  orientation: 'white' | 'black';
  /** Shapes attached to the starting position (moves carry their own). */
  startShapes: readonly BoardShape[];
  review: GameReview | null;
  reviewProgress: ReviewProgress;
  source: RemoteGame | null;
  /** Id of the move whose classification badge should animate in. */
  badgeId: string | null;

  /* actions */
  reset(startFen?: string): void;
  loadTree(tree: GameTree, headers?: GameHeaders, source?: RemoteGame | null): void;
  loadPgn(pgn: string, source?: RemoteGame | null): boolean;
  play(input: MoveInput | string): MoveNode | null;
  goTo(nodeId: string | null): void;
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  /** Switch to the previous/next sibling variation at the current node. */
  prevVariation(): void;
  nextVariation(): void;
  /** Make a variation the mainline at its branch point. */
  promote(nodeId: string): void;
  /** Delete a move and its whole subtree. */
  deleteNode(nodeId: string): void;
  flip(): void;
  setComment(nodeId: string, comment: string): void;
  setShapes(nodeId: string | null, shapes: readonly BoardShape[]): void;
  toggleHighlight(nodeId: string | null, square: BoardShape): void;
  clearShapes(nodeId: string | null): void;
  setAssessment(nodeId: string, assessment: MoveAssessment): void;
  applyReview(tree: GameTree, review: GameReview): void;
  setReviewProgress(progress: ReviewProgress): void;
  clearBadge(): void;
  setHeaders(headers: GameHeaders): void;
}

const IDLE_PROGRESS: ReviewProgress = { done: 0, total: 0, running: false };

/** Shared empty array — zustand v5 compares selector results with `Object.is`. */
const NO_SHAPES: readonly BoardShape[] = [];

export const useGame = create<GameState>()((set, get) => ({
  tree: emptyTree(START_FEN),
  headers: {},
  orientation: 'white',
  startShapes: [],
  review: null,
  reviewProgress: IDLE_PROGRESS,
  source: null,
  badgeId: null,

  reset: (startFen = START_FEN) =>
    set({
      tree: emptyTree(startFen),
      headers: {},
      startShapes: [],
      review: null,
      reviewProgress: IDLE_PROGRESS,
      source: null,
      badgeId: null,
    }),

  loadTree: (tree, headers = {}, source = null) =>
    set({
      tree,
      headers,
      source,
      startShapes: [],
      review: null,
      reviewProgress: IDLE_PROGRESS,
      badgeId: null,
    }),

  loadPgn: (pgn, source = null) => {
    const parsed = parsePgnToTree(pgn);
    if (parsed.tree.rootChildren.length === 0 && parsed.tree.startFen === START_FEN) return false;
    get().loadTree(parsed.tree, parsed.headers, source);
    return true;
  },

  play: (input) => {
    const result = treePlay(get().tree, input);
    if (!result) return null;
    set({ tree: result.tree, badgeId: null, review: result.existing ? get().review : null });
    return result.node;
  },

  goTo: (nodeId) => set({ tree: goToNode(get().tree, nodeId), badgeId: null }),
  first: () => set({ tree: toStart(get().tree), badgeId: null }),
  previous: () => set({ tree: toPrevious(get().tree), badgeId: null }),
  next: () => set({ tree: toNext(get().tree), badgeId: null }),
  last: () => set({ tree: toEnd(get().tree), badgeId: null }),
  prevVariation: () => set({ tree: siblingVariation(get().tree, -1), badgeId: null }),
  nextVariation: () => set({ tree: siblingVariation(get().tree, 1), badgeId: null }),

  promote: (nodeId) => set({ tree: treePromote(get().tree, nodeId) }),
  deleteNode: (nodeId) => set({ tree: treeDeleteNode(get().tree, nodeId), review: null }),

  flip: () => set({ orientation: get().orientation === 'white' ? 'black' : 'white' }),

  setComment: (nodeId, comment) => set({ tree: treeUpdateNode(get().tree, nodeId, { comment }) }),

  setShapes: (nodeId, shapes) => {
    if (nodeId === null) {
      set({ startShapes: shapes });
      return;
    }
    set({ tree: treeUpdateNode(get().tree, nodeId, { shapes }) });
  },

  toggleHighlight: (nodeId, shape) => {
    const existing = shapesAt(get(), nodeId);
    const match = existing.findIndex(
      (item) => item.kind === shape.kind && item.from === shape.from && item.to === shape.to,
    );
    const nextShapes =
      match >= 0
        ? existing.filter((_, i) => i !== match)
        : [...existing.filter((item) => !(item.kind === 'highlight' && item.from === shape.from)), shape];
    get().setShapes(nodeId, nextShapes);
  },

  clearShapes: (nodeId) => get().setShapes(nodeId, []),

  setAssessment: (nodeId, assessment) =>
    set({ tree: treeUpdateNode(get().tree, nodeId, { assessment }), badgeId: nodeId }),

  applyReview: (tree, review) =>
    set({ tree, review, reviewProgress: IDLE_PROGRESS, badgeId: null }),

  setReviewProgress: (progress) => set({ reviewProgress: progress }),

  clearBadge: () => set({ badgeId: null }),

  setHeaders: (headers) => set({ headers: { ...get().headers, ...headers } }),
}));

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function fenOf(state: GameState): string {
  return treeFen(state.tree);
}

export function currentNode(state: GameState): MoveNode | null {
  return treeCurrentNode(state.tree);
}

export function shapesAt(state: GameState, nodeId: string | null): readonly BoardShape[] {
  if (nodeId === null) return state.startShapes;
  return nodeOf(state.tree, nodeId)?.shapes ?? NO_SHAPES;
}

export function currentShapes(state: GameState): readonly BoardShape[] {
  return shapesAt(state, state.tree.cursor);
}

/**
 * SAN moves along the path to the cursor — what the opening book should match.
 * Allocates, so derive it with `useMemo` from the `tree` rather than as a selector.
 */
export function sanToCursor(tree: GameTree): string[] {
  return movesToNode(tree, tree.cursor).map((move) => move.san);
}

/** The mainline moves, for consumers that need a linear view. */
export function mainlineMoves(tree: GameTree): MoveNode[] {
  return treeMainline(tree);
}

export function isGameOver(state: GameState): boolean {
  return chessAtCursor(state.tree).isGameOver();
}
