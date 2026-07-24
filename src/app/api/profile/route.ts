import { NextResponse } from 'next/server';
import type { Platform } from '@/types';
import { fetchChesscomProfile } from '@/lib/api/chesscom';
import { fetchLichessProfile } from '@/lib/api/lichess';
import { ApiError, isValidUsername } from '@/lib/api/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Profiles are proxied through the server so we control the User-Agent header
 * (Chess.com rejects browser-origin requests without one) and avoid CORS entirely.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') as Platform | null;
  const username = (searchParams.get('username') ?? '').trim();

  if (platform !== 'lichess' && platform !== 'chesscom') {
    return NextResponse.json({ error: 'platform must be "lichess" or "chesscom".' }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'Enter a valid username (2-32 letters, digits, - or _).' }, { status: 400 });
  }

  try {
    const profile =
      platform === 'lichess' ? await fetchLichessProfile(username) : await fetchChesscomProfile(username);
    return NextResponse.json(profile, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 502;
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}
