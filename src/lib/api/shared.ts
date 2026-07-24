import type { Platform } from '@/types';

export const USER_AGENT =
  'ChessStudio/1.0 (self-hosted analysis app; https://github.com/chess-studio)';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('The upstream service did not respond in time.', 504);
    }
    throw new ApiError(err instanceof Error ? err.message : 'Network error.', 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(describeStatus(response.status), response.status);
  }
  return (await response.json()) as T;
}

export function describeStatus(status: number): string {
  switch (status) {
    case 404:
      return 'That player could not be found.';
    case 429:
      return 'Rate limited by the upstream service — wait a moment and try again.';
    case 403:
      return 'The upstream service refused the request.';
    default:
      return `Upstream service returned ${status}.`;
  }
}

/**
 * Accepts a bare username or a full profile URL from either site and returns
 * the canonical username.
 */
export function extractUsername(input: string): { username: string; platform: Platform | null } {
  const value = input.trim();
  if (!value) return { username: '', platform: null };

  const lichessMatch = value.match(/lichess\.org\/@\/([\w-]+)/i);
  if (lichessMatch) return { username: lichessMatch[1], platform: 'lichess' };

  const chesscomMatch = value.match(/chess\.com\/(?:member|player)\/([\w-]+)/i);
  if (chesscomMatch) return { username: chesscomMatch[1], platform: 'chesscom' };

  // A raw URL we do not recognise: fall back to the last path segment.
  if (/^https?:\/\//i.test(value)) {
    const segments = value.replace(/[?#].*$/, '').split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    return { username: last.replace(/^@/, ''), platform: null };
  }

  return { username: value.replace(/^@/, ''), platform: null };
}

export function isValidUsername(username: string): boolean {
  return /^[\w-]{2,32}$/.test(username);
}

/** Normalises a game result token coming from either API. */
export function resultToken(winner: 'white' | 'black' | null, drawish: boolean): string {
  if (winner === 'white') return '1-0';
  if (winner === 'black') return '0-1';
  return drawish ? '1/2-1/2' : '*';
}
