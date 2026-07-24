'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Platform, PlayerProfile, RemoteGame } from '@/types';
import { getGames, getProfile } from '@/lib/api/client';
import { extractUsername, isValidUsername } from '@/lib/api/shared';
import { useGame } from '@/store/gameStore';
import { Button, EmptyState, ErrorNote, PanelHeader, Spinner } from './ui/Primitives';

const PLATFORMS: { id: Platform; label: string; accent: string }[] = [
  { id: 'lichess', label: 'Lichess', accent: '#e8ecf5' },
  { id: 'chesscom', label: 'Chess.com', accent: '#7fce6b' },
];

function relativeDate(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function ResultTag({ result }: { result: string }) {
  const tone =
    result === '1-0' ? 'text-[#e8ecf5]' : result === '0-1' ? 'text-[#6ea8fe]' : 'text-[var(--text-muted)]';
  const label = result === '1/2-1/2' ? '½-½' : result;
  return <span className={clsx('font-mono text-[0.68rem] font-bold tabular-nums', tone)}>{label}</span>;
}

export function ProfileFetch() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform>('lichess');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [games, setGames] = useState<RemoteGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const loadPgn = useGame((state) => state.loadPgn);
  const setHeaders = useGame((state) => state.setHeaders);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Pasting a full profile URL picks the platform automatically.
  useEffect(() => {
    const detected = extractUsername(query);
    if (detected.platform && detected.platform !== platform) setPlatform(detected.platform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const search = useCallback(
    async (targetPlatform: Platform = platform) => {
      const { username } = extractUsername(query);
      if (!isValidUsername(username)) {
        setError('Enter a username or paste a Lichess / Chess.com profile link.');
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setError(null);
      setProfile(null);
      setGames([]);

      try {
        const [fetchedProfile, fetchedGames] = await Promise.all([
          getProfile(targetPlatform, username, controller.signal),
          getGames(targetPlatform, username, 20, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setProfile(fetchedProfile);
        setGames(fetchedGames);
        if (fetchedGames.length === 0) setError('No recent standard games found for that account.');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not reach that service.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [platform, query],
  );

  const openGame = useCallback(
    (game: RemoteGame) => {
      const ok = loadPgn(game.pgn, game);
      if (!ok) {
        setError('That game could not be parsed into a playable line.');
        return;
      }
      setHeaders({
        white: game.white,
        black: game.black,
        result: game.result,
        whiteElo: game.whiteRating ? String(game.whiteRating) : undefined,
        blackElo: game.blackRating ? String(game.blackRating) : undefined,
        opening: game.opening ?? undefined,
        eco: game.eco ?? undefined,
        site: game.url,
      });
      setLoadedId(game.id);
    },
    [loadPgn, setHeaders],
  );

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title="Player profiles" subtitle="Load recent games straight from Lichess or Chess.com" />

      <div className="space-y-3 border-b border-white/[0.06] p-3">
        <div className="flex gap-1 rounded-xl bg-black/25 p-1">
          {PLATFORMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPlatform(item.id);
                if (profile) void search(item.id);
              }}
              className={clsx(
                'relative flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                platform === item.id ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {platform === item.id ? (
                <motion.span
                  layoutId="platform-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg bg-white/[0.10]"
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            className="input"
            placeholder="Username or profile link"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? <Spinner /> : 'Fetch'}
          </Button>
        </form>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence>
          {profile ? (
            <motion.div
              key={`${profile.platform}-${profile.username}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 border-b border-white/[0.06] p-3"
            >
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  className="h-11 w-11 rounded-lg border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-lg">
                  ♞
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {profile.title ? (
                    <span className="chip border-[rgba(242,193,78,0.4)] text-[#f2c14e]">{profile.title}</span>
                  ) : null}
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate text-sm font-semibold text-white hover:text-[var(--accent)]"
                  >
                    {profile.displayName}
                  </a>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.ratings.slice(0, 4).map((rating) => (
                    <span key={rating.key} className="chip font-mono">
                      {rating.label} {rating.value}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {games.length === 0 && !loading && !profile ? (
          <EmptyState
            title="Analyse anyone's games"
            body="Type a username — or paste a link like lichess.org/@/DrNykterstein — and pick a game to load onto the board."
            icon="⚑"
          />
        ) : null}

        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : null}

        <div className="divide-y divide-white/[0.04]">
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => openGame(game)}
              className={clsx(
                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]',
                loadedId === game.id && 'bg-[rgba(110,168,254,0.12)]',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                  {game.white}
                  {game.whiteRating ? <span className="text-[var(--text-muted)]"> ({game.whiteRating})</span> : null}
                  <span className="mx-1 text-[var(--text-muted)]">vs</span>
                  {game.black}
                  {game.blackRating ? <span className="text-[var(--text-muted)]"> ({game.blackRating})</span> : null}
                </p>
                <p className="mt-0.5 truncate text-[0.66rem] text-[var(--text-muted)]">
                  {game.speed} · {game.rated ? 'rated' : 'casual'} · {relativeDate(game.playedAt)}
                  {game.opening ? ` · ${game.opening}` : ''}
                </p>
              </div>
              <ResultTag result={game.result} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
