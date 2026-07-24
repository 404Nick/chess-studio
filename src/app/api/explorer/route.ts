import { NextResponse } from 'next/server';
import { type ExplorerDb, fetchExplorer } from '@/lib/api/lichess';
import { ApiError } from '@/lib/api/shared';
import { validateFen } from '@/lib/chess/fen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const fen = (searchParams.get('fen') ?? '').trim();
  const db = (searchParams.get('db') ?? 'lichess') as ExplorerDb;

  if (db !== 'lichess' && db !== 'masters') {
    return NextResponse.json({ error: 'db must be "lichess" or "masters".' }, { status: 400 });
  }

  const validation = validateFen(fen);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error ?? 'Invalid FEN.' }, { status: 400 });
  }

  try {
    const stats = await fetchExplorer(fen, db);
    return NextResponse.json(stats, {
      // Opening statistics change very slowly; a short edge cache keeps the UI snappy.
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 502;
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}
