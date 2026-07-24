import type { PlayerProfile, RemoteGame } from '@/types';
import { ApiError, fetchJson } from './shared';

const CHESSCOM_API = 'https://api.chess.com/pub';

interface ChesscomPlayer {
  '@id': string;
  url: string;
  username: string;
  name?: string;
  title?: string;
  avatar?: string;
  country?: string;
}

interface ChesscomStatEntry {
  last?: { rating?: number };
  record?: { win?: number; loss?: number; draw?: number };
}

interface ChesscomStats {
  chess_bullet?: ChesscomStatEntry;
  chess_blitz?: ChesscomStatEntry;
  chess_rapid?: ChesscomStatEntry;
  chess_daily?: ChesscomStatEntry;
}

const STAT_LABELS: [keyof ChesscomStats, string, string][] = [
  ['chess_bullet', 'bullet', 'Bullet'],
  ['chess_blitz', 'blitz', 'Blitz'],
  ['chess_rapid', 'rapid', 'Rapid'],
  ['chess_daily', 'daily', 'Daily'],
];

export async function fetchChesscomProfile(username: string): Promise<PlayerProfile> {
  const handle = username.toLowerCase();
  const player = await fetchJson<ChesscomPlayer>(`${CHESSCOM_API}/player/${encodeURIComponent(handle)}`);

  let stats: ChesscomStats = {};
  try {
    stats = await fetchJson<ChesscomStats>(`${CHESSCOM_API}/player/${encodeURIComponent(handle)}/stats`);
  } catch {
    // Stats are optional — a brand new account may not have any.
  }

  const ratings = STAT_LABELS.map(([key, id, label]) => {
    const rating = stats[key]?.last?.rating;
    return typeof rating === 'number' ? { key: id, label, value: rating } : null;
  })
    .filter((entry): entry is { key: string; label: string; value: number } => entry !== null)
    .sort((a, b) => b.value - a.value);

  const totalGames = STAT_LABELS.reduce((sum, [key]) => {
    const record = stats[key]?.record;
    if (!record) return sum;
    return sum + (record.win ?? 0) + (record.loss ?? 0) + (record.draw ?? 0);
  }, 0);

  return {
    platform: 'chesscom',
    username: player.username,
    displayName: player.name ?? player.username,
    url: player.url,
    avatar: player.avatar ?? null,
    title: player.title ?? null,
    country: player.country ? (player.country.split('/').pop() ?? null) : null,
    ratings,
    totalGames: totalGames > 0 ? totalGames : null,
  };
}

interface ChesscomGame {
  url: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  rules?: string;
  eco?: string;
  initial_setup?: string;
  fen?: string;
  white: { username: string; rating?: number; result?: string };
  black: { username: string; rating?: number; result?: string };
}

const WIN = 'win';
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

function mapResult(game: ChesscomGame): string {
  if (game.white.result === WIN) return '1-0';
  if (game.black.result === WIN) return '0-1';
  if (DRAW_RESULTS.has(game.white.result ?? '') || DRAW_RESULTS.has(game.black.result ?? '')) return '1/2-1/2';
  return '*';
}

/** The `eco` field is a URL like `.../openings/Sicilian-Defense-Najdorf`. */
function ecoName(url: string | undefined): { eco: string | null; opening: string | null } {
  if (!url) return { eco: null, opening: null };
  const slug = url.split('/').pop() ?? '';
  if (!slug) return { eco: null, opening: null };
  const name = decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  // Chess.com slugs often end with a move-number suffix, e.g. "...-3.Bb5-a6".
  return { eco: null, opening: name || null };
}

function pgnTag(pgn: string, tag: string): string | null {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return match ? match[1] : null;
}

export async function fetchChesscomGames(username: string, max: number): Promise<RemoteGame[]> {
  const handle = username.toLowerCase();

  const archives = await fetchJson<{ archives?: string[] }>(
    `${CHESSCOM_API}/player/${encodeURIComponent(handle)}/games/archives`,
  );

  const urls = (archives.archives ?? []).slice(-4).reverse();
  if (urls.length === 0) return [];

  const collected: RemoteGame[] = [];

  for (const archiveUrl of urls) {
    if (collected.length >= max) break;

    let batch: { games?: ChesscomGame[] };
    try {
      batch = await fetchJson<{ games?: ChesscomGame[] }>(archiveUrl);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) continue;
      throw err;
    }

    const games = (batch.games ?? [])
      .filter((game) => Boolean(game.pgn) && (game.rules ?? 'chess') === 'chess')
      .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));

    for (const game of games) {
      if (collected.length >= max) break;
      const pgn = game.pgn as string;
      const { opening } = ecoName(game.eco);

      collected.push({
        id: game.url.split('/').pop() ?? game.url,
        platform: 'chesscom',
        url: game.url,
        white: game.white.username,
        black: game.black.username,
        whiteRating: game.white.rating ?? null,
        blackRating: game.black.rating ?? null,
        result: mapResult(game),
        speed: game.time_class ?? 'unknown',
        rated: Boolean(game.rated),
        playedAt: (game.end_time ?? 0) * 1000,
        opening: opening ?? pgnTag(pgn, 'Opening'),
        eco: pgnTag(pgn, 'ECO'),
        pgn,
        initialFen: game.initial_setup ?? pgnTag(pgn, 'FEN'),
      });
    }
  }

  return collected.sort((a, b) => b.playedAt - a.playedAt).slice(0, max);
}
