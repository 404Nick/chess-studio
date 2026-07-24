import type { ExplorerGame, ExplorerStats, PlayerProfile, RemoteGame } from '@/types';
import { ApiError, describeStatus, fetchJson, fetchWithTimeout, resultToken } from './shared';

const LICHESS_API = 'https://lichess.org/api';
const EXPLORER_API = 'https://explorer.lichess.ovh';

interface LichessPerf {
  rating?: number;
  games?: number;
}

interface LichessUser {
  id: string;
  username: string;
  title?: string;
  perfs?: Record<string, LichessPerf>;
  count?: { all?: number };
  profile?: { flag?: string; country?: string };
}

const PERF_LABELS: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
  puzzle: 'Puzzles',
};

export async function fetchLichessProfile(username: string): Promise<PlayerProfile> {
  const user = await fetchJson<LichessUser>(`${LICHESS_API}/user/${encodeURIComponent(username)}`);

  const ratings = Object.entries(user.perfs ?? {})
    .filter(([key, perf]) => PERF_LABELS[key] && typeof perf.rating === 'number' && (perf.games ?? 0) > 0)
    .map(([key, perf]) => ({ key, label: PERF_LABELS[key], value: perf.rating as number }))
    .sort((a, b) => b.value - a.value);

  return {
    platform: 'lichess',
    username: user.username,
    displayName: user.username,
    url: `https://lichess.org/@/${user.username}`,
    avatar: null,
    title: user.title ?? null,
    country: user.profile?.flag ?? user.profile?.country ?? null,
    ratings,
    totalGames: user.count?.all ?? null,
  };
}

interface LichessGame {
  id: string;
  rated: boolean;
  speed: string;
  createdAt: number;
  lastMoveAt?: number;
  status: string;
  winner?: 'white' | 'black';
  initialFen?: string;
  pgn?: string;
  opening?: { eco?: string; name?: string };
  players: {
    white?: { user?: { name?: string }; rating?: number; aiLevel?: number };
    black?: { user?: { name?: string }; rating?: number; aiLevel?: number };
  };
}

function playerName(side: LichessGame['players']['white']): string {
  if (side?.user?.name) return side.user.name;
  if (typeof side?.aiLevel === 'number') return `Stockfish level ${side.aiLevel}`;
  return 'Anonymous';
}

const DRAW_STATUSES = new Set(['draw', 'stalemate']);

export async function fetchLichessGames(username: string, max: number): Promise<RemoteGame[]> {
  const params = new URLSearchParams({
    max: String(Math.max(1, Math.min(50, max))),
    pgnInJson: 'true',
    opening: 'true',
    moves: 'true',
    clocks: 'false',
    evals: 'false',
    tags: 'true',
    sort: 'dateDesc',
  });

  const response = await fetchWithTimeout(
    `${LICHESS_API}/games/user/${encodeURIComponent(username)}?${params.toString()}`,
    { headers: { Accept: 'application/x-ndjson' } },
    25_000,
  );

  if (!response.ok) throw new ApiError(describeStatus(response.status), response.status);

  const body = await response.text();
  const games: RemoteGame[] = [];

  for (const rawLine of body.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let game: LichessGame;
    try {
      game = JSON.parse(trimmed) as LichessGame;
    } catch {
      continue;
    }
    if (!game.pgn) continue;

    games.push({
      id: game.id,
      platform: 'lichess',
      url: `https://lichess.org/${game.id}`,
      white: playerName(game.players.white),
      black: playerName(game.players.black),
      whiteRating: game.players.white?.rating ?? null,
      blackRating: game.players.black?.rating ?? null,
      result: resultToken(game.winner ?? null, DRAW_STATUSES.has(game.status)),
      speed: game.speed ?? 'unknown',
      rated: Boolean(game.rated),
      playedAt: game.lastMoveAt ?? game.createdAt,
      opening: game.opening?.name ?? null,
      eco: game.opening?.eco ?? null,
      pgn: game.pgn,
      initialFen: game.initialFen ?? null,
    });
  }

  return games;
}

/* ------------------------------------------------------------------ */
/* Opening explorer                                                    */
/* ------------------------------------------------------------------ */

interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  opening?: { eco?: string; name?: string } | null;
  moves?: {
    uci: string;
    san: string;
    white: number;
    draws: number;
    black: number;
    averageRating?: number;
  }[];
  topGames?: {
    id: string;
    winner?: 'white' | 'black' | null;
    white: { name: string; rating: number };
    black: { name: string; rating: number };
    year?: number;
  }[];
}

export type ExplorerDb = 'lichess' | 'masters';

export async function fetchExplorer(fen: string, db: ExplorerDb): Promise<ExplorerStats> {
  const params = new URLSearchParams({ fen, topGames: '4', moves: '12' });
  if (db === 'lichess') {
    params.set('speeds', 'blitz,rapid,classical');
    params.set('ratings', '1600,1800,2000,2200,2500');
    params.set('recentGames', '0');
  }

  const data = await fetchJson<ExplorerResponse>(`${EXPLORER_API}/${db}?${params.toString()}`);

  const moves = (data.moves ?? []).map((move) => ({
    uci: move.uci,
    san: move.san,
    white: move.white,
    draws: move.draws,
    black: move.black,
    total: move.white + move.draws + move.black,
    averageRating: move.averageRating ?? null,
  }));

  const topGames: ExplorerGame[] = (data.topGames ?? []).map((game) => ({
    id: game.id,
    white: game.white.name,
    black: game.black.name,
    whiteRating: game.white.rating ?? null,
    blackRating: game.black.rating ?? null,
    winner: game.winner ?? 'draw',
    year: game.year ?? null,
  }));

  return {
    white: data.white,
    draws: data.draws,
    black: data.black,
    total: data.white + data.draws + data.black,
    opening: data.opening?.name ? { eco: data.opening.eco ?? '', name: data.opening.name } : null,
    moves,
    topGames,
  };
}
