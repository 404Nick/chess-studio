import { NextResponse } from 'next/server';
import type { Platform } from '@/types';
import { fetchChesscomGames } from '@/lib/api/chesscom';
import { fetchLichessGames } from '@/lib/api/lichess';
import { ApiError, isValidUsername } from '@/lib/api/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') as Platform | null;
  const username = (searchParams.get('username') ?? '').trim();
  const max = Math.max(1, Math.min(50, Number(searchParams.get('max') ?? 20) || 20));

  if (platform !== 'lichess' && platform !== 'chesscom') {
    return NextResponse.json({ error: 'platform must be "lichess" or "chesscom".' }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'Enter a valid username (2-32 letters, digits, - or _).' }, { status: 400 });
  }

  try {
    const games =
      platform === 'lichess'
        ? await fetchLichessGames(username, max)
        : await fetchChesscomGames(username, max);
    return NextResponse.json({ games });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 502;
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}
