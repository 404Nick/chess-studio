import type { Color, PieceSymbol, Square } from '@/types';

/**
 * A flat 64-entry board used for fast static analysis (attack maps, SEE, tactics).
 * Index layout: `index = rank * 8 + file`, where rank 0 is rank "1" and file 0 is "a".
 * This is deliberately independent of chess.js internals so it never breaks on upgrades.
 */
export interface BoardPiece {
  readonly type: PieceSymbol;
  readonly color: Color;
}

export type BoardArray = (BoardPiece | null)[];

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** Standard centipawn values used for material counting and SEE. */
export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function fileOf(index: number): number {
  return index & 7;
}

export function rankOf(index: number): number {
  return index >> 3;
}

export function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - 97; // 'a'
  const rank = square.charCodeAt(1) - 49; // '1'
  return rank * 8 + file;
}

export function indexToSquare(index: number): Square {
  return `${FILES[index & 7]}${(index >> 3) + 1}` as Square;
}

export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/** Parses the piece-placement field of a FEN into a `BoardArray`. */
export function boardFromFen(fen: string): BoardArray {
  const board: BoardArray = new Array(64).fill(null);
  const placement = fen.split(' ')[0] ?? '';
  const rows = placement.split('/');
  for (let row = 0; row < rows.length && row < 8; row += 1) {
    const rank = 7 - row; // FEN starts at rank 8
    let file = 0;
    for (const ch of rows[row]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      if (file > 7) break;
      const lower = ch.toLowerCase() as PieceSymbol;
      if ('pnbrqk'.includes(lower)) {
        board[rank * 8 + file] = { type: lower, color: ch === lower ? 'b' : 'w' };
      }
      file += 1;
    }
  }
  return board;
}

export function cloneBoard(board: BoardArray): BoardArray {
  return board.slice();
}

export function findKing(board: BoardArray, color: Color): number {
  for (let i = 0; i < 64; i += 1) {
    const piece = board[i];
    if (piece && piece.type === 'k' && piece.color === color) return i;
  }
  return -1;
}

const KNIGHT_DELTAS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_DELTAS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const ROOK_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const BISHOP_DIRS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * All indices holding a piece of `byColor` that attacks `target`.
 * Pawn pushes are not attacks; en-passant is ignored (irrelevant for static analysis).
 */
export function attackersOf(board: BoardArray, target: number, byColor: Color): number[] {
  const tf = fileOf(target);
  const tr = rankOf(target);
  const result: number[] = [];

  // Pawns: a white pawn on (f, r) attacks (f±1, r+1), so its attackers sit one rank below.
  const pawnRank = byColor === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (!onBoard(f, pawnRank)) continue;
    const piece = board[pawnRank * 8 + f];
    if (piece && piece.type === 'p' && piece.color === byColor) result.push(pawnRank * 8 + f);
  }

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const piece = board[r * 8 + f];
    if (piece && piece.type === 'n' && piece.color === byColor) result.push(r * 8 + f);
  }

  for (const [df, dr] of KING_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const piece = board[r * 8 + f];
    if (piece && piece.type === 'k' && piece.color === byColor) result.push(r * 8 + f);
  }

  const scan = (dirs: readonly (readonly [number, number])[], types: string) => {
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (onBoard(f, r)) {
        const idx = r * 8 + f;
        const piece = board[idx];
        if (piece) {
          if (piece.color === byColor && types.includes(piece.type)) result.push(idx);
          break;
        }
        f += df;
        r += dr;
      }
    }
  };

  scan(ROOK_DIRS, 'rq');
  scan(BISHOP_DIRS, 'bq');

  return result;
}

export function isAttacked(board: BoardArray, target: number, byColor: Color): boolean {
  return attackersOf(board, target, byColor).length > 0;
}

/** Every square (occupied or not) that the piece on `from` currently attacks. */
export function attacksFrom(board: BoardArray, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  const out: number[] = [];

  const push = (f: number, r: number) => {
    if (onBoard(f, r)) out.push(r * 8 + f);
  };

  switch (piece.type) {
    case 'p': {
      const dr = piece.color === 'w' ? 1 : -1;
      push(f0 - 1, r0 + dr);
      push(f0 + 1, r0 + dr);
      break;
    }
    case 'n':
      for (const [df, dr] of KNIGHT_DELTAS) push(f0 + df, r0 + dr);
      break;
    case 'k':
      for (const [df, dr] of KING_DELTAS) push(f0 + df, r0 + dr);
      break;
    default: {
      const dirs =
        piece.type === 'r' ? ROOK_DIRS : piece.type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let f = f0 + df;
        let r = r0 + dr;
        while (onBoard(f, r)) {
          out.push(r * 8 + f);
          if (board[r * 8 + f]) break;
          f += df;
          r += dr;
        }
      }
    }
  }
  return out;
}

/**
 * Static Exchange Evaluation for the capture sequence that starts when `byColor`
 * captures whatever stands on `target`. Returns the net material gain in centipawns
 * for `byColor`, assuming both sides always recapture with their least valuable piece
 * and stop as soon as continuing would lose material.
 *
 * Promotions and en-passant are ignored — this is a heuristic used for "is it hanging?".
 */
export function seeCapture(board: BoardArray, target: number, byColor: Color): number {
  const victim = board[target];
  if (!victim) return 0;

  const attackers = attackersOf(board, target, byColor);
  if (attackers.length === 0) return 0;

  // Least valuable attacker first.
  let bestFrom = attackers[0];
  let bestValue = PIECE_VALUE[board[bestFrom]!.type];
  for (const idx of attackers) {
    const value = PIECE_VALUE[board[idx]!.type];
    if (value < bestValue) {
      bestValue = value;
      bestFrom = idx;
    }
  }

  // A king may only capture when the square is not defended afterwards.
  if (board[bestFrom]!.type === 'k' && attackersOf(board, target, opposite(byColor)).length > 0) {
    const nonKing = attackers.filter((idx) => board[idx]!.type !== 'k');
    if (nonKing.length === 0) return 0;
    bestFrom = nonKing.reduce((a, b) => (PIECE_VALUE[board[a]!.type] <= PIECE_VALUE[board[b]!.type] ? a : b));
  }

  const next = cloneBoard(board);
  next[target] = next[bestFrom];
  next[bestFrom] = null;

  // The "max(0, ...)" models the option to simply not continue the exchange.
  return Math.max(0, PIECE_VALUE[victim.type] - seeCapture(next, target, opposite(byColor)));
}

/**
 * Net material `byColor` loses on `target` if the opponent initiates a capture there.
 * A positive number means the piece standing on `target` is effectively hanging.
 */
export function hangingValue(board: BoardArray, target: number): number {
  const piece = board[target];
  if (!piece || piece.type === 'k') return 0;
  return seeCapture(board, target, opposite(piece.color));
}

/** Total material for one side in centipawns, kings excluded. */
export function materialFor(board: BoardArray, color: Color): number {
  let total = 0;
  for (const piece of board) {
    if (piece && piece.color === color && piece.type !== 'k') total += PIECE_VALUE[piece.type];
  }
  return total;
}

/** Material balance from `color`'s point of view. */
export function materialBalance(board: BoardArray, color: Color): number {
  return materialFor(board, color) - materialFor(board, opposite(color));
}

/** Counts non-pawn, non-king material for both sides — used to detect endgames. */
export function nonPawnMaterial(board: BoardArray): number {
  let total = 0;
  for (const piece of board) {
    if (piece && piece.type !== 'k' && piece.type !== 'p') total += PIECE_VALUE[piece.type];
  }
  return total;
}
