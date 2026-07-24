import type { Color, PieceSymbol, Square } from '@/types';
import {
  type BoardArray,
  PIECE_NAME,
  PIECE_VALUE,
  attackersOf,
  attacksFrom,
  fileOf,
  findKing,
  hangingValue,
  indexToSquare,
  onBoard,
  opposite,
  rankOf,
  squareToIndex,
} from './board';

export interface HangingPiece {
  readonly square: Square;
  readonly type: PieceSymbol;
  /** Centipawns the owner stands to lose. */
  readonly loss: number;
}

export interface ForkTarget {
  readonly square: Square;
  readonly type: PieceSymbol;
}

export interface Fork {
  readonly from: Square;
  readonly piece: PieceSymbol;
  readonly targets: readonly ForkTarget[];
  readonly hitsKing: boolean;
}

export interface Pin {
  readonly from: Square;
  readonly attacker: PieceSymbol;
  readonly pinned: Square;
  readonly pinnedType: PieceSymbol;
  readonly behind: Square;
  readonly behindType: PieceSymbol;
  /** A pin against the king is absolute; anything else is relative (a skewer-style pin). */
  readonly absolute: boolean;
}

export interface PositionFacts {
  readonly hanging: readonly HangingPiece[];
  readonly forks: readonly Fork[];
  readonly pins: readonly Pin[];
  readonly kingAttackers: number;
  readonly developedMinors: number;
  readonly centerPawns: number;
}

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

/** Pieces of `color` that the opponent can win material from by capturing. */
export function findHanging(board: BoardArray, color: Color): HangingPiece[] {
  const out: HangingPiece[] = [];
  for (let i = 0; i < 64; i += 1) {
    const piece = board[i];
    if (!piece || piece.color !== color || piece.type === 'k') continue;
    const loss = hangingValue(board, i);
    if (loss > 0) out.push({ square: indexToSquare(i), type: piece.type, loss });
  }
  return out.sort((a, b) => b.loss - a.loss);
}

/**
 * A fork is one piece attacking two or more enemy targets that are worth taking:
 * the king, or a piece that is either undefended or more valuable than the attacker.
 */
export function findForks(board: BoardArray, byColor: Color): Fork[] {
  const enemy = opposite(byColor);
  const out: Fork[] = [];

  for (let from = 0; from < 64; from += 1) {
    const attacker = board[from];
    if (!attacker || attacker.color !== byColor) continue;

    const attackerValue = PIECE_VALUE[attacker.type];
    const targets: ForkTarget[] = [];
    let hitsKing = false;
    const seen = new Set<number>();

    for (const idx of attacksFrom(board, from)) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      const victim = board[idx];
      if (!victim || victim.color !== enemy) continue;

      if (victim.type === 'k') {
        hitsKing = true;
        targets.push({ square: indexToSquare(idx), type: 'k' });
        continue;
      }
      if (victim.type === 'p') continue; // forking two pawns is not news

      const defended = attackersOf(board, idx, enemy).length > 0;
      const worthwhile = !defended || PIECE_VALUE[victim.type] > attackerValue;
      if (worthwhile) targets.push({ square: indexToSquare(idx), type: victim.type });
    }

    if (targets.length >= 2) {
      out.push({ from: indexToSquare(from), piece: attacker.type, targets, hitsKing });
    }
  }

  return out.sort((a, b) => Number(b.hitsKing) - Number(a.hitsKing) || b.targets.length - a.targets.length);
}

/** Sliding pieces of `byColor` pinning an enemy piece against a more valuable one. */
export function findPins(board: BoardArray, byColor: Color): Pin[] {
  const enemy = opposite(byColor);
  const out: Pin[] = [];

  for (let from = 0; from < 64; from += 1) {
    const attacker = board[from];
    if (!attacker || attacker.color !== byColor) continue;
    if (attacker.type !== 'r' && attacker.type !== 'b' && attacker.type !== 'q') continue;

    const dirs =
      attacker.type === 'r' ? ROOK_DIRS : attacker.type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];

    for (const [df, dr] of dirs) {
      let f = fileOf(from) + df;
      let r = rankOf(from) + dr;
      let first = -1;

      while (onBoard(f, r)) {
        const idx = r * 8 + f;
        const piece = board[idx];
        if (piece) {
          if (first === -1) {
            // The screened piece must belong to the opponent.
            if (piece.color !== enemy) break;
            first = idx;
          } else {
            if (piece.color === enemy && PIECE_VALUE[piece.type] > PIECE_VALUE[board[first]!.type]) {
              out.push({
                from: indexToSquare(from),
                attacker: attacker.type,
                pinned: indexToSquare(first),
                pinnedType: board[first]!.type,
                behind: indexToSquare(idx),
                behindType: piece.type,
                absolute: piece.type === 'k',
              });
            }
            break;
          }
        }
        f += df;
        r += dr;
      }
    }
  }

  return out.sort((a, b) => Number(b.absolute) - Number(a.absolute));
}

/** Number of enemy pieces bearing down on the squares around `color`'s king. */
export function countKingAttackers(board: BoardArray, color: Color): number {
  const kingIdx = findKing(board, color);
  if (kingIdx < 0) return 0;
  const enemy = opposite(color);
  const attackers = new Set<number>();
  const kf = fileOf(kingIdx);
  const kr = rankOf(kingIdx);

  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const f = kf + df;
      const r = kr + dr;
      if (!onBoard(f, r)) continue;
      for (const idx of attackersOf(board, r * 8 + f, enemy)) {
        if (board[idx]!.type !== 'p') attackers.add(idx);
      }
    }
  }
  return attackers.size;
}

/** Minor pieces that have left their starting squares. */
export function countDevelopedMinors(board: BoardArray, color: Color): number {
  const home: Square[] = color === 'w' ? ['b1', 'c1', 'f1', 'g1'] : ['b8', 'c8', 'f8', 'g8'];
  let developed = 4;
  for (const square of home) {
    const piece = board[squareToIndex(square)];
    if (piece && piece.color === color && (piece.type === 'n' || piece.type === 'b')) developed -= 1;
  }
  return developed;
}

/** Pawns of `color` occupying the four central squares. */
export function countCenterPawns(board: BoardArray, color: Color): number {
  const center: Square[] = ['d4', 'e4', 'd5', 'e5'];
  let count = 0;
  for (const square of center) {
    const piece = board[squareToIndex(square)];
    if (piece && piece.color === color && piece.type === 'p') count += 1;
  }
  return count;
}

export function analysePosition(board: BoardArray, forColor: Color): PositionFacts {
  return {
    hanging: findHanging(board, forColor),
    forks: findForks(board, opposite(forColor)),
    pins: findPins(board, opposite(forColor)),
    kingAttackers: countKingAttackers(board, forColor),
    developedMinors: countDevelopedMinors(board, forColor),
    centerPawns: countCenterPawns(board, forColor),
  };
}

export function pieceLabel(type: PieceSymbol): string {
  return PIECE_NAME[type];
}

/** "the knight on f3" / "the queen on d1" */
export function describePiece(type: PieceSymbol, square: Square): string {
  return `the ${PIECE_NAME[type]} on ${square}`;
}

/** Joins a list into readable prose: "a, b and c". */
export function listPhrase(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
