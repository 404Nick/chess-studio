import { NextResponse } from 'next/server';
import { ApiError, fetchWithTimeout } from '@/lib/api/shared';
import { validateFen } from '@/lib/chess/fen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_EVAL_API = 'https://lichess.org/api/cloud-eval';

/** One principal variation exactly as Lichess reports it. Scores are WHITE-POV. */
interface LichessCloudPv {
  moves: string;
  cp?: number;
  mate?: number;
}

interface LichessCloudEval {
  fen: string;
  knodes: number;
  depth: number;
  pvs: LichessCloudPv[];
}

/**
 * Proxies Lichess' cloud evaluation cache.
 *
 * Lichess only stores evaluations for positions people have actually analysed, so a
 * miss (HTTP 404 upstream) is expected and normal — we report it as `{ found: false }`
 * with a 200 so the client can fall back to the local engine without logging a network
 * error. Scores come back from WHITE's point of view (verified against a known
 * black-to-move position), matching this app's internal convention, so they are passed
 * through unchanged rather than normalised like raw UCI output.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const fen = (searchParams.get('fen') ?? '').trim();
  const multiPv = Math.max(1, Math.min(5, Number(searchParams.get('multiPv')) || 1));

  const validation = validateFen(fen);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error ?? 'Invalid FEN.' }, { status: 400 });
  }

  const url = `${CLOUD_EVAL_API}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });

    // Not in the cloud cache — a normal outcome, not an error.
    if (response.status === 404) {
      return NextResponse.json({ found: false }, { status: 200 });
    }
    if (!response.ok) {
      return NextResponse.json({ found: false, error: `Upstream returned ${response.status}.` }, { status: 200 });
    }

    const data = (await response.json()) as LichessCloudEval;
    return NextResponse.json(
      { found: true, ...data },
      {
        // A cloud evaluation for a given position is effectively immutable; cache hard.
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
      },
    );
  } catch (err) {
    // Network/timeout failures should not surface as errors — the client falls back
    // to the local engine, so a miss is the right signal.
    const detail = err instanceof ApiError ? err.message : 'Cloud evaluation unavailable.';
    return NextResponse.json({ found: false, error: detail }, { status: 200 });
  }
}
