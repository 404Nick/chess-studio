import { Chess } from 'chess.js';
import type { Color, Square } from '@/types';
import { type BoardArray, FILES, indexToSquare, squareToIndex } from './board';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

export interface FenParts {
  placement: string;
  turn: Color;
  castling: string;
  enPassant: string;
  halfmove: number;
  fullmove: number;
}

export function parseFen(fen: string): FenParts {
  const [placement = '8/8/8/8/8/8/8/8', turn = 'w', castling = '-', enPassant = '-', half = '0', full = '1'] =
    fen.trim().split(/\s+/);
  return {
    placement,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling || '-',
    enPassant: enPassant || '-',
    halfmove: Number.isFinite(Number(half)) ? Number(half) : 0,
    fullmove: Number.isFinite(Number(full)) && Number(full) > 0 ? Number(full) : 1,
  };
}

export function buildFen(parts: FenParts): string {
  const castling = parts.castling.replace(/[^KQkq]/g, '') || '-';
  const ep = /^[a-h][36]$/.test(parts.enPassant) ? parts.enPassant : '-';
  return [
    parts.placement,
    parts.turn,
    castling,
    ep,
    Math.max(0, Math.trunc(parts.halfmove)),
    Math.max(1, Math.trunc(parts.fullmove)),
  ].join(' ');
}

export function fenTurn(fen: string): Color {
  return parseFen(fen).turn;
}

export function fenFullmove(fen: string): number {
  return parseFen(fen).fullmove;
}

/** Serialises a `BoardArray` back into the FEN piece-placement field. */
export function placementFromBoard(board: BoardArray): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

export interface FenValidation {
  readonly ok: boolean;
  readonly error?: string;
  /** True when the position is structurally sane but not legal to *play* (e.g. king in check on the wrong turn). */
  readonly playable: boolean;
}

/**
 * Validates a FEN both structurally and against chess.js. The editor needs to know the
 * difference between "obviously broken" and "legal position we can start a game from".
 */
export function validateFen(fen: string): FenValidation {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return { ok: false, playable: false, error: 'FEN needs at least a board and a side to move.' };

  const rows = parts[0].split('/');
  if (rows.length !== 8) return { ok: false, playable: false, error: 'Board must have 8 ranks.' };

  for (const row of rows) {
    let count = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') count += Number(ch);
      else if ('pnbrqkPNBRQK'.includes(ch)) count += 1;
      else return { ok: false, playable: false, error: `Unexpected character "${ch}" in board.` };
    }
    if (count !== 8) return { ok: false, playable: false, error: `Rank "${row}" does not add up to 8 squares.` };
  }

  const whiteKings = (parts[0].match(/K/g) ?? []).length;
  const blackKings = (parts[0].match(/k/g) ?? []).length;
  if (whiteKings !== 1) return { ok: false, playable: false, error: 'Position needs exactly one white king.' };
  if (blackKings !== 1) return { ok: false, playable: false, error: 'Position needs exactly one black king.' };

  if (/[pP]/.test(rows[0]) || /[pP]/.test(rows[7])) {
    return { ok: false, playable: false, error: 'Pawns cannot stand on the first or eighth rank.' };
  }

  try {
    // eslint-disable-next-line no-new
    new Chess(fen);
    return { ok: true, playable: true };
  } catch (err) {
    return {
      ok: true,
      playable: false,
      error: err instanceof Error ? err.message : 'Position is not legal to play from.',
    };
  }
}

/**
 * Recomputes castling rights so they only mention rooks/kings that are actually home.
 * Used by the position editor after every edit so exported FENs stay legal.
 */
export function sanitiseCastling(board: BoardArray, castling: string): string {
  const at = (square: Square) => board[squareToIndex(square)];
  let out = '';
  const whiteKingHome = at('e1')?.type === 'k' && at('e1')?.color === 'w';
  const blackKingHome = at('e8')?.type === 'k' && at('e8')?.color === 'b';

  if (castling.includes('K') && whiteKingHome && at('h1')?.type === 'r' && at('h1')?.color === 'w') out += 'K';
  if (castling.includes('Q') && whiteKingHome && at('a1')?.type === 'r' && at('a1')?.color === 'w') out += 'Q';
  if (castling.includes('k') && blackKingHome && at('h8')?.type === 'r' && at('h8')?.color === 'b') out += 'k';
  if (castling.includes('q') && blackKingHome && at('a8')?.type === 'r' && at('a8')?.color === 'b') out += 'q';

  return out || '-';
}

/** Squares that may legally hold an en-passant target for the given side to move. */
export function enPassantOptions(board: BoardArray, turn: Color): Square[] {
  const out: Square[] = [];
  // If white is to move, the capture square sits on rank 6 with a black pawn on rank 5.
  const targetRank = turn === 'w' ? 5 : 2; // 0-based: rank 6 -> index 5, rank 3 -> index 2
  const pawnRank = turn === 'w' ? 4 : 3;
  const pawnColor: Color = turn === 'w' ? 'b' : 'w';

  for (let file = 0; file < 8; file += 1) {
    const pawn = board[pawnRank * 8 + file];
    if (pawn && pawn.type === 'p' && pawn.color === pawnColor && !board[targetRank * 8 + file]) {
      out.push(`${FILES[file]}${targetRank + 1}` as Square);
    }
  }
  return out;
}

/** All occupied squares, used by the editor to render the palette counts. */
export function occupiedSquares(board: BoardArray): Square[] {
  const out: Square[] = [];
  for (let i = 0; i < 64; i += 1) if (board[i]) out.push(indexToSquare(i));
  return out;
}
