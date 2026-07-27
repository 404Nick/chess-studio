import type { EngineLine, PositionAnalysis, Score } from '@/types';
import { fenTurn } from '@/lib/chess/fen';
import { uciLineToSan } from '@/lib/chess/line';
import { scoreToNumber } from './uci';

interface CloudPv {
  readonly moves: string;
  readonly cp?: number;
  readonly mate?: number;
}

interface CloudResponse {
  readonly found: boolean;
  readonly depth?: number;
  readonly knodes?: number;
  readonly pvs?: readonly CloudPv[];
}

/**
 * Fetches a Lichess cloud evaluation for `fen`, shaped into the same
 * {@link PositionAnalysis} the local engine produces so the two are interchangeable.
 *
 * Returns `null` when the position is not in Lichess' cache, the request fails, or the
 * network is unavailable — in every one of those cases the caller should fall back to
 * the local Stockfish worker.
 *
 * Cloud scores are already WHITE-POV, so — unlike raw UCI — they are used as-is.
 */
export async function fetchCloudEval(
  fen: string,
  multiPv: number,
  signal?: AbortSignal,
): Promise<PositionAnalysis | null> {
  const capped = Math.max(1, Math.min(5, multiPv));

  let data: CloudResponse;
  try {
    const response = await fetch(
      `/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${capped}`,
      { signal },
    );
    if (!response.ok) return null;
    data = (await response.json()) as CloudResponse;
  } catch {
    return null;
  }

  if (!data.found || !data.pvs || data.pvs.length === 0) return null;

  const turn = fenTurn(fen);
  const depth = data.depth ?? 0;
  const knodes = data.knodes ?? 0;

  const lines: EngineLine[] = data.pvs
    .map((pv, index) => {
      const uci = pv.moves.split(/\s+/).filter(Boolean);
      const score: Score =
        typeof pv.mate === 'number'
          ? { kind: 'mate', value: pv.mate }
          : { kind: 'cp', value: pv.cp ?? 0 };
      return {
        multipv: index + 1,
        score,
        depth,
        seldepth: depth,
        pv: uci,
        san: uciLineToSan(fen, uci.slice(0, 12)),
        nodes: knodes * 1000,
        nps: 0,
        timeMs: 0,
      } satisfies EngineLine;
    })
    // Best first from the mover's perspective (scores are white-POV).
    .sort((a, b) => {
      const av = turn === 'w' ? scoreToNumber(a.score) : -scoreToNumber(a.score);
      const bv = turn === 'w' ? scoreToNumber(b.score) : -scoreToNumber(b.score);
      return bv - av;
    });

  return {
    fen,
    depth,
    lines,
    bestMove: lines[0]?.pv[0] ?? null,
    partial: false,
  };
}
