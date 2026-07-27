import type { Color, Line, MoveClass } from '@/types';

/**
 * A "learn from your mistakes" puzzle: a position where a mistake or blunder was played,
 * asking the solver to find the engine's preferred move instead.
 */
export interface Tactic {
  /** Stable id (the position key), also used to de-duplicate. */
  id: string;
  /** Position to solve — the one *before* the mistake was played. */
  fen: string;
  /** The move to find, in UCI. */
  solutionUci: string;
  solutionSan: string;
  /** The sub-par move that was actually played. */
  playedSan: string;
  classification: MoveClass;
  /** Side to move (the side that went wrong). */
  side: Color;
  ply: number;
}

const FLAGGED: ReadonlySet<MoveClass> = new Set<MoveClass>(['blunder', 'mistake']);

function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/**
 * Extracts tactics from reviewed games: every mistake/blunder that has a known best
 * reply becomes a puzzle. Positions are de-duplicated, hardest (blunders) first.
 */
export function extractTactics(reviews: readonly { line: Line }[]): Tactic[] {
  const seen = new Set<string>();
  const out: Tactic[] = [];

  for (const { line } of reviews) {
    for (const move of line.moves) {
      const assessment = move.assessment;
      if (!assessment || !FLAGGED.has(assessment.classification)) continue;

      const solutionUci = assessment.best?.pv[0];
      if (!solutionUci) continue;

      const key = positionKey(move.fenBefore);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: key,
        fen: move.fenBefore,
        solutionUci,
        solutionSan: assessment.best?.san[0] ?? solutionUci,
        playedSan: move.san,
        classification: assessment.classification,
        side: move.color,
        ply: move.ply,
      });
    }
  }

  // Blunders before mistakes; otherwise keep discovery order.
  return out.sort((a, b) => Number(b.classification === 'blunder') - Number(a.classification === 'blunder'));
}

/** In-place-safe Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
