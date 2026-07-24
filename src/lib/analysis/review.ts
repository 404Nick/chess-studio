import { Chess } from 'chess.js';
import type {
  AccuracyReport,
  ClassCounts,
  GameReview,
  Line,
  MoveAssessment,
  MoveClass,
  MoveNode,
  PositionAnalysis,
} from '@/types';
import type { Lang } from '@/lib/i18n/translations';
import type { StockfishEngine } from '@/lib/engine/StockfishEngine';
import { accuracyFromWinDrop, scoreFor, scoreToCp, winPercentFor } from '@/lib/engine/uci';
import { CLASS_ORDER, classifyMove, nagFor } from './classify';
import { explainMove } from './explain';

export interface ReviewOptions {
  readonly depth: number;
  readonly multiPv: number;
  /** Half-moves that are still inside the opening book and should be labelled "book". */
  readonly bookPlies: number;
  readonly openingName: string | null;
  /** Language for the generated move explanations. */
  readonly lang?: Lang;
  readonly onProgress?: (done: number, total: number) => void;
  readonly shouldCancel?: () => boolean;
}

export interface ReviewResult {
  readonly line: Line;
  readonly review: GameReview;
}

export class ReviewCancelledError extends Error {
  constructor() {
    super('Review cancelled.');
    this.name = 'ReviewCancelledError';
  }
}

function emptyCounts(): ClassCounts {
  return CLASS_ORDER.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as ClassCounts);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 100;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function harmonicMean(values: readonly number[]): number {
  const safe = values.map((v) => Math.max(v, 1));
  if (safe.length === 0) return 100;
  return safe.length / safe.reduce((acc, v) => acc + 1 / v, 0);
}

/**
 * Blends the arithmetic and harmonic means the way Lichess does, so a single
 * catastrophic move drags the score down more than a plain average would.
 */
function accuracyScore(perMove: readonly number[]): number {
  if (perMove.length === 0) return 100;
  const blended = (mean(perMove) + harmonicMean(perMove)) / 2;
  return Math.max(0, Math.min(100, Number(blended.toFixed(1))));
}

function countLegalMoves(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return 0;
  }
}

/**
 * Runs a full-game engine review: every position is evaluated once, then each played
 * move is classified and explained against the evaluation of the position before it.
 */
export async function reviewGame(
  engine: StockfishEngine,
  line: Line,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const { moves } = line;
  const total = moves.length + 1;
  const analyses: PositionAnalysis[] = [];

  const positions = [line.startFen, ...moves.map((move) => move.fenAfter)];

  for (let i = 0; i < positions.length; i += 1) {
    if (options.shouldCancel?.()) throw new ReviewCancelledError();

    // The final position has no move to classify against; a shallow pass is enough
    // to close out the evaluation graph.
    const isTerminal = i === positions.length - 1;
    const analysis = await engine.analyse({
      fen: positions[i],
      depth: isTerminal ? Math.max(6, options.depth - 4) : options.depth,
      multiPv: Math.max(2, options.multiPv),
    });
    analyses.push(analysis);
    options.onProgress?.(i + 1, total);
  }

  const reviewed: MoveNode[] = [];
  const perMoveAccuracy: { w: number[]; b: number[] } = { w: [], b: [] };
  const cpLosses: { w: number[]; b: number[] } = { w: [], b: [] };
  const counts = { w: emptyCounts(), b: emptyCounts() };

  moves.forEach((node, index) => {
    const before = analyses[index];
    const after = analyses[index + 1];
    const legalMoves = countLegalMoves(node.fenBefore);
    const isBook = index < options.bookPlies;

    const verdict = classifyMove({ node, before, after, legalMoves, isBook });

    const explanation = explainMove(
      {
        node,
        before,
        after,
        classification: verdict.classification,
        cpLoss: verdict.cpLoss,
        winDrop: verdict.winDrop,
        scoreBefore: verdict.scoreBefore,
        scoreAfter: verdict.scoreAfter,
        sacrificedValue: verdict.sacrificedValue,
        openingName: options.openingName,
        legalMoves,
      },
      options.lang,
    );

    const assessment: MoveAssessment = {
      classification: verdict.classification,
      cpLoss: verdict.cpLoss,
      winDrop: verdict.winDrop,
      best: before.lines[0] ?? null,
      secondBest: before.lines[1] ?? null,
      scoreBefore: verdict.scoreBefore,
      scoreAfter: verdict.scoreAfter,
      explanation: explanation.text,
      details: explanation.details,
      betterMove: explanation.betterMove,
    };

    reviewed.push({ ...node, assessment, nag: nagFor(verdict.classification) ?? node.nag });

    const side = node.color;
    counts[side][verdict.classification] += 1;
    cpLosses[side].push(verdict.cpLoss);

    const winBefore = winPercentFor(verdict.scoreBefore, side);
    const winAfter = winPercentFor(verdict.scoreAfter, side);
    perMoveAccuracy[side].push(accuracyFromWinDrop(winBefore, winAfter));
  });

  const accuracy: AccuracyReport = {
    white: accuracyScore(perMoveAccuracy.w),
    black: accuracyScore(perMoveAccuracy.b),
  };

  const evalSeries = analyses.map((analysis) => {
    const score = analysis.lines[0]?.score;
    if (!score) return 0;
    return Math.max(-10, Math.min(10, scoreToCp(score) / 100));
  });

  const review: GameReview = {
    accuracy,
    counts,
    averageCpLoss: {
      w: Math.round(mean(cpLosses.w.length ? cpLosses.w : [0])),
      b: Math.round(mean(cpLosses.b.length ? cpLosses.b : [0])),
    },
    evalSeries,
    depth: options.depth,
    completedAt: Date.now(),
  };

  return { line: { ...line, moves: reviewed }, review };
}

/**
 * Classifies a single move on demand — used when the user plays a move on the board
 * and we want an instant verdict without reviewing the whole game.
 */
export interface QuickAssessInput {
  readonly node: MoveNode;
  readonly before: PositionAnalysis;
  readonly after: PositionAnalysis;
  readonly bookPlies: number;
  readonly openingName: string | null;
  readonly lang?: Lang;
}

export function assessSingleMove(input: QuickAssessInput): MoveAssessment {
  const legalMoves = countLegalMoves(input.node.fenBefore);
  const isBook = input.node.ply <= input.bookPlies;

  const verdict = classifyMove({
    node: input.node,
    before: input.before,
    after: input.after,
    legalMoves,
    isBook,
  });

  const explanation = explainMove(
    {
      node: input.node,
      before: input.before,
      after: input.after,
      classification: verdict.classification,
      cpLoss: verdict.cpLoss,
      winDrop: verdict.winDrop,
      scoreBefore: verdict.scoreBefore,
      scoreAfter: verdict.scoreAfter,
      sacrificedValue: verdict.sacrificedValue,
      openingName: input.openingName,
      legalMoves,
    },
    input.lang,
  );

  return {
    classification: verdict.classification,
    cpLoss: verdict.cpLoss,
    winDrop: verdict.winDrop,
    best: input.before.lines[0] ?? null,
    secondBest: input.before.lines[1] ?? null,
    scoreBefore: verdict.scoreBefore,
    scoreAfter: verdict.scoreAfter,
    explanation: explanation.text,
    details: explanation.details,
    betterMove: explanation.betterMove,
  };
}

/** Totals across both colours, for the summary panel. */
export function totalCount(review: GameReview, klass: MoveClass): number {
  return review.counts.w[klass] + review.counts.b[klass];
}

export { scoreFor };
