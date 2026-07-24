import type { Color, Score } from '@/types';

export interface RawInfo {
  readonly depth: number;
  readonly seldepth: number;
  readonly multipv: number;
  /** Score exactly as reported: from the side-to-move's point of view. */
  readonly score: Score;
  readonly pv: readonly string[];
  readonly nodes: number;
  readonly nps: number;
  readonly timeMs: number;
  /** Engine reported a lower/upper bound — such lines are unreliable and skipped. */
  readonly bound: boolean;
}

/**
 * Parses a UCI `info` line. Returns `null` for lines that carry no principal variation
 * (e.g. `info depth 1 currmove e2e4 currmovenumber 1`).
 */
export function parseInfo(line: string): RawInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.split(/\s+/);

  let depth = 0;
  let seldepth = 0;
  let multipv = 1;
  let nodes = 0;
  let nps = 0;
  let timeMs = 0;
  let bound = false;
  let score: Score | null = null;
  let pv: string[] | null = null;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token) {
      case 'depth':
        depth = Number(tokens[++i]) || 0;
        break;
      case 'seldepth':
        seldepth = Number(tokens[++i]) || 0;
        break;
      case 'multipv':
        multipv = Number(tokens[++i]) || 1;
        break;
      case 'nodes':
        nodes = Number(tokens[++i]) || 0;
        break;
      case 'nps':
        nps = Number(tokens[++i]) || 0;
        break;
      case 'time':
        timeMs = Number(tokens[++i]) || 0;
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]) || 0;
        score = kind === 'mate' ? { kind: 'mate', value } : { kind: 'cp', value };
        // `lowerbound` / `upperbound` may follow the value.
        const next = tokens[i + 1];
        if (next === 'lowerbound' || next === 'upperbound') {
          bound = true;
          i += 1;
        }
        break;
      }
      case 'pv':
        pv = tokens.slice(i + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  if (!score || !pv || pv.length === 0) return null;
  return { depth, seldepth, multipv, score, pv, nodes, nps, timeMs, bound };
}

export function parseBestMove(line: string): string | null {
  if (!line.startsWith('bestmove')) return null;
  const move = line.split(/\s+/)[1];
  if (!move || move === '(none)' || move === 'NULL') return null;
  return move;
}

/**
 * Converts a side-to-move relative score into an absolute, white-positive score.
 * Every score stored in the app uses the white point of view.
 */
export function normaliseScore(score: Score, sideToMove: Color): Score {
  if (sideToMove === 'w') return score;
  return { kind: score.kind, value: -score.value } as Score;
}

/** Flips a white-POV score to the point of view of `color`. */
export function scoreFor(score: Score, color: Color): Score {
  if (color === 'w') return score;
  return { kind: score.kind, value: -score.value } as Score;
}

/** A single comparable number for sorting/《better than》 checks, mate-aware. */
export function scoreToNumber(score: Score): number {
  if (score.kind === 'mate') {
    // Mate in n is worth more the sooner it lands; keep it far outside centipawn range.
    return score.value > 0 ? 100000 - score.value * 100 : -100000 - score.value * 100;
  }
  return score.value;
}

/** Centipawn value clamped into a sane range, used for win-probability maths. */
export function scoreToCp(score: Score, cap = 1200): number {
  if (score.kind === 'mate') return score.value > 0 ? cap : -cap;
  return Math.max(-cap, Math.min(cap, score.value));
}

/**
 * "+1.24", "−0.35", "M4", "−M2".
 * `score` is white-POV; pass `pov` to render it from Black's side instead.
 */
export function formatScore(score: Score, pov: Color = 'w'): string {
  const view = scoreFor(score, pov);
  if (view.kind === 'mate') {
    if (view.value === 0) return '#';
    return `${view.value > 0 ? '' : '−'}M${Math.abs(view.value)}`;
  }
  const pawns = view.value / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : '';
  return `${sign}${Math.abs(pawns).toFixed(2)}`;
}

/**
 * Lichess' win-probability model. Returns White's expected score as a percentage.
 * See https://lichess.org/page/accuracy
 */
export function winPercent(score: Score): number {
  if (score.kind === 'mate') return score.value > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Win percentage from the point of view of `color`. */
export function winPercentFor(score: Score, color: Color): number {
  const white = winPercent(score);
  return color === 'w' ? white : 100 - white;
}

/**
 * Lichess' per-move accuracy curve, mapping a drop in winning chances to a 0-100 score.
 */
export function accuracyFromWinDrop(before: number, after: number): number {
  const drop = Math.max(0, before - after);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}
