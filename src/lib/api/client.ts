import type { ExplorerStats, Platform, PlayerProfile, RemoteGame } from '@/types';

/**
 * Browser-side wrappers around this app's own API routes. Everything goes through
 * the server so Chess.com's User-Agent requirement and CORS are non-issues.
 */

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

export function getProfile(
  platform: Platform,
  username: string,
  signal?: AbortSignal,
): Promise<PlayerProfile> {
  const params = new URLSearchParams({ platform, username });
  return getJson<PlayerProfile>(`/api/profile?${params.toString()}`, signal);
}

export async function getGames(
  platform: Platform,
  username: string,
  max = 20,
  signal?: AbortSignal,
): Promise<RemoteGame[]> {
  const params = new URLSearchParams({ platform, username, max: String(max) });
  const payload = await getJson<{ games: RemoteGame[] }>(`/api/games?${params.toString()}`, signal);
  return payload.games ?? [];
}

export function getExplorer(
  fen: string,
  db: 'lichess' | 'masters',
  signal?: AbortSignal,
): Promise<ExplorerStats> {
  const params = new URLSearchParams({ fen, db });
  return getJson<ExplorerStats>(`/api/explorer?${params.toString()}`, signal);
}
