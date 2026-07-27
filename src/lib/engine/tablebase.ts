import type { EngineLine, PositionAnalysis, Score } from '@/types';
import { fenTurn } from '@/lib/chess/fen';
import { uciToSan } from '@/lib/chess/line';
import { normaliseScore } from './uci';

/** Lichess tablebase result category, from the point of view of the side to move. */
type Category =
  | 'win'
  | 'maybe-win'
  | 'cursed-win'
  | 'draw'
  | 'blessed-loss'
  | 'maybe-loss'
  | 'loss'
  | 'unknown';

interface TablebaseMove {
  readonly uci: string;
  readonly san: string;
  readonly dtz: number | null;
  readonly dtm: number | null;
  readonly category: Category;
}

interface TablebaseResponse {
  readonly found: boolean;
  readonly category?: Category;
  readonly dtz?: number | null;
  readonly checkmate?: boolean;
  readonly stalemate?: boolean;
  readonly moves?: readonly TablebaseMove[];
}

/** Number of pieces on the board — the tablebase only covers positions with ≤ 7. */
export function pieceCount(fen: string): number {
  const board = fen.trim().split(/\s+/)[0] ?? '';
  let count = 0;
  for (const ch of board) if (/[a-z]/i.test(ch)) count += 1;
  return count;
}

/** A decisive-but-finite centipawn value for a WDL category, from the mover's side. */
function categoryToCp(category: Category | undefined): number {
  switch (category) {
    case 'win':
      return 12_000;
    case 'maybe-win':
      return 800;
    case 'cursed-win':
      return 300;
    case 'blessed-loss':
      return -300;
    case 'maybe-loss':
      return -800;
    case 'loss':
      return -12_000;
    default:
      return 0;
  }
}

/**
 * Fetches an exact endgame evaluation from the Lichess tablebase and shapes it into a
 * {@link PositionAnalysis}. Returns null when the position is not covered (too many
 * pieces), the request fails, or the network is unavailable — the caller then falls
 * back to cloud/local evaluation. Every candidate move is a legal, tablebase-optimal
 * reply; each line's score is white-POV, like the rest of the app.
 */
export async function fetchTablebase(
  fen: string,
  multiPv: number,
  signal?: AbortSignal,
): Promise<PositionAnalysis | null> {
  if (pieceCount(fen) > 7) return null;

  let data: TablebaseResponse;
  try {
    const response = await fetch(`/api/tablebase?fen=${encodeURIComponent(fen)}`, { signal });
    if (!response.ok) return null;
    data = (await response.json()) as TablebaseResponse;
  } catch {
    return null;
  }

  if (!data.found) return null;

  const turn = fenTurn(fen);
  const capped = Math.max(1, Math.min(5, multiPv));
  const moves = (data.moves ?? []).slice(0, capped);

  const lines: EngineLine[] = moves.map((move, index) => {
    // A move's category is reported from the *opponent's* side (they are to move next),
    // so the mover's score is its negation.
    const moverCp = -categoryToCp(move.category);
    const score: Score = normaliseScore({ kind: 'cp', value: moverCp }, turn);
    const san = uciToSan(fen, move.uci);
    return {
      multipv: index + 1,
      score,
      // depth 0 marks a solved (tablebase) line so the UI can badge it "TB".
      depth: 0,
      seldepth: 0,
      pv: [move.uci],
      san: san ? [san] : [],
      nodes: 0,
      nps: 0,
      timeMs: 0,
    } satisfies EngineLine;
  });

  // When the position itself is terminal or has no listed moves, still surface the WDL.
  if (lines.length === 0) {
    const score: Score = normaliseScore({ kind: 'cp', value: categoryToCp(data.category) }, turn);
    lines.push({
      multipv: 1,
      score,
      depth: 0,
      seldepth: 0,
      pv: [],
      san: [],
      nodes: 0,
      nps: 0,
      timeMs: 0,
    });
  }

  return {
    fen,
    depth: 0,
    lines,
    bestMove: moves[0]?.uci ?? null,
    partial: false,
  };
}
