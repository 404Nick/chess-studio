import { NextResponse } from 'next/server';
import { ApiError, fetchWithTimeout } from '@/lib/api/shared';
import { validateFen } from '@/lib/chess/fen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLEBASE_API = 'https://tablebase.lichess.ovh/standard';

/**
 * Proxies Lichess' Syzygy tablebase for standard chess (positions with ≤ 7 pieces).
 *
 * A position outside the tablebase (too many pieces) or an unreachable upstream both
 * resolve to `{ found: false }` with a 200 so the client falls back to cloud/local
 * evaluation without logging a network error. All categories are from the side-to-move
 * point of view, exactly as Lichess reports them.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const fen = (searchParams.get('fen') ?? '').trim();

  const validation = validateFen(fen);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error ?? 'Invalid FEN.' }, { status: 400 });
  }

  const url = `${TABLEBASE_API}?fen=${encodeURIComponent(fen)}`;

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) {
      return NextResponse.json({ found: false }, { status: 200 });
    }
    if (!response.ok) {
      return NextResponse.json({ found: false, error: `Upstream returned ${response.status}.` }, { status: 200 });
    }
    const data = await response.json();
    return NextResponse.json(
      { found: true, ...data },
      { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  } catch (err) {
    const detail = err instanceof ApiError ? err.message : 'Tablebase unavailable.';
    return NextResponse.json({ found: false, error: detail }, { status: 200 });
  }
}
