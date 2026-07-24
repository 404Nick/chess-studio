import type { Color, MoveClass, MoveClassMeta, MoveNode, PositionAnalysis, Score } from '@/types';
import { boardFromFen, opposite, seeCapture, squareToIndex } from '@/lib/chess/board';
import { findHanging } from '@/lib/chess/tactics';
import { scoreFor, scoreToCp, winPercentFor } from '@/lib/engine/uci';

export const MOVE_CLASS_META: Record<MoveClass, MoveClassMeta> = {
  brilliant: {
    id: 'brilliant',
    label: 'Brilliant',
    glyph: '★',
    color: '#26c6da',
    ring: 'rgba(38,198,218,0.45)',
    blurb: 'A spectacular move — material is offered for a decisive initiative.',
  },
  great: {
    id: 'great',
    label: 'Great move',
    glyph: '✦',
    color: '#5b8def',
    ring: 'rgba(91,141,239,0.45)',
    blurb: 'The only move that keeps the advantage; everything else lets it slip.',
  },
  best: {
    id: 'best',
    label: 'Best move',
    glyph: '✓',
    color: '#7fce6b',
    ring: 'rgba(127,206,107,0.45)',
    blurb: "The engine's first choice.",
  },
  excellent: {
    id: 'excellent',
    label: 'Excellent',
    glyph: '✓',
    color: '#95d47a',
    ring: 'rgba(149,212,122,0.4)',
    blurb: 'Practically as good as the top choice.',
  },
  good: {
    id: 'good',
    label: 'Good',
    glyph: '✓',
    color: '#a8c98f',
    ring: 'rgba(168,201,143,0.35)',
    blurb: 'A sound move that keeps the position healthy.',
  },
  book: {
    id: 'book',
    label: 'Book',
    glyph: '❧',
    color: '#b9a37e',
    ring: 'rgba(185,163,126,0.4)',
    blurb: 'Established opening theory.',
  },
  forced: {
    id: 'forced',
    label: 'Forced',
    glyph: '➔',
    color: '#9aa3b2',
    ring: 'rgba(154,163,178,0.35)',
    blurb: 'The only legal move in the position.',
  },
  inaccuracy: {
    id: 'inaccuracy',
    label: 'Inaccuracy',
    glyph: '?!',
    color: '#f2c14e',
    ring: 'rgba(242,193,78,0.45)',
    blurb: 'A slip that hands over part of the advantage.',
  },
  mistake: {
    id: 'mistake',
    label: 'Mistake',
    glyph: '?',
    color: '#f08c3a',
    ring: 'rgba(240,140,58,0.45)',
    blurb: 'A serious error that changes the assessment.',
  },
  blunder: {
    id: 'blunder',
    label: 'Blunder',
    glyph: '✕',
    color: '#e5484d',
    ring: 'rgba(229,72,77,0.5)',
    blurb: 'A game-changing mistake.',
  },
};

export const CLASS_ORDER: readonly MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'blunder',
];

export interface ClassifyInput {
  readonly node: MoveNode;
  /** Analysis of the position *before* the move (MultiPV >= 2 preferred). */
  readonly before: PositionAnalysis;
  /** Analysis of the position *after* the move. */
  readonly after: PositionAnalysis;
  /** Number of legal moves that were available. */
  readonly legalMoves: number;
  /** The move is still inside the opening book. */
  readonly isBook: boolean;
}

export interface ClassifyResult {
  readonly classification: MoveClass;
  readonly cpLoss: number;
  readonly winDrop: number;
  readonly scoreBefore: Score;
  readonly scoreAfter: Score;
  readonly isTopChoice: boolean;
  readonly sacrificedValue: number;
}

/** Centipawns the move loses relative to best play, from the mover's point of view. */
function centipawnLoss(before: Score, after: Score, mover: Color): number {
  const b = scoreToCp(scoreFor(before, mover));
  const a = scoreToCp(scoreFor(after, mover));
  return Math.max(0, b - a);
}

/**
 * Material the mover deliberately left en prise. Uses static exchange evaluation so a
 * simple recapture or a defended piece does not register as a sacrifice.
 */
export function sacrificeValue(node: MoveNode): number {
  const boardAfter = boardFromFen(node.fenAfter);
  const enemy = opposite(node.color);

  // Value the opponent can win on the destination square (the classic piece sac).
  const onDestination = seeCapture(boardAfter, squareToIndex(node.to), enemy);

  // Anything else the move left loose (a discovered/desperado sacrifice).
  const otherLoose = findHanging(boardAfter, node.color)
    .filter((entry) => entry.square !== node.to)
    .reduce((max, entry) => Math.max(max, entry.loss), 0);

  const grossSac = Math.max(onDestination, otherLoose);
  if (grossSac <= 0) return 0;

  // Discount material the move itself just captured — that is a trade, not a sacrifice.
  const captured = node.captured ? { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }[node.captured] : 0;
  return Math.max(0, grossSac - captured);
}

export function classifyMove(input: ClassifyInput): ClassifyResult {
  const { node, before, after, legalMoves, isBook } = input;
  const mover = node.color;

  const bestLine = before.lines[0] ?? null;
  const secondLine = before.lines[1] ?? null;
  const afterLine = after.lines[0] ?? null;

  const scoreBefore: Score = bestLine?.score ?? { kind: 'cp', value: 0 };
  const scoreAfter: Score = afterLine?.score ?? scoreBefore;

  const winBefore = winPercentFor(scoreBefore, mover);
  const winAfter = winPercentFor(scoreAfter, mover);
  const winDrop = Math.max(0, winBefore - winAfter);
  const cpLoss = centipawnLoss(scoreBefore, scoreAfter, mover);

  const topUci = bestLine?.pv[0] ?? before.bestMove;
  const isTopChoice = topUci === node.uci || cpLoss <= 3;
  const sacrificed = sacrificeValue(node);

  const base = (): MoveClass => {
    if (legalMoves <= 1) return 'forced';
    if (isBook) return 'book';

    // Softening rule: once a position is already dead lost, further drops are not
    // meaningful blunders — the game was decided earlier.
    const deadLost = winBefore < 3;

    if (winDrop < 2) return isTopChoice ? 'best' : 'excellent';
    if (winDrop < 5) return 'good';
    if (deadLost) return 'good';
    if (winDrop < 10) return 'inaccuracy';
    if (winDrop < 20) return 'mistake';
    return 'blunder';
  };

  let classification = base();

  // --- Great move: the played move is best and clearly the *only* good one. ---
  if (classification === 'best' && secondLine) {
    const winSecond = winPercentFor(secondLine.score, mover);
    const gapToSecond = winAfter - winSecond;
    const stillContested = winBefore > 8 && winBefore < 92;
    if (gapToSecond >= 10 && stillContested) classification = 'great';
  }

  // --- Brilliant: a genuine sacrifice that is also (near) best and keeps the game good. ---
  if ((classification === 'best' || classification === 'great' || classification === 'excellent') && !isBook) {
    const nearBest = cpLoss <= 15;
    const stillHealthy = winAfter >= 48;
    const notAlreadyWinning = winBefore < 97;
    const realSacrifice = sacrificed >= 200;
    if (nearBest && stillHealthy && notAlreadyWinning && realSacrifice) classification = 'brilliant';
  }

  return {
    classification,
    cpLoss,
    winDrop,
    scoreBefore,
    scoreAfter,
    isTopChoice,
    sacrificedValue: sacrificed,
  };
}

/** Maps a classification onto the NAG suffix used when exporting PGN. */
export function nagFor(classification: MoveClass): string | undefined {
  switch (classification) {
    case 'brilliant':
      return '!!';
    case 'great':
      return '!';
    case 'inaccuracy':
      return '?!';
    case 'mistake':
      return '?';
    case 'blunder':
      return '??';
    default:
      return undefined;
  }
}
