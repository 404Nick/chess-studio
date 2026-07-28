'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClassCounts, MoveClass, Platform } from '@/types';
import type { GameRecord } from '@/lib/games/gamesDb';
import { getAllGames, recordFromRemote } from '@/lib/games/gamesDb';
import { type OpeningStat, type Record3, computeStats } from '@/lib/games/stats';
import { CLASS_ORDER, MOVE_CLASS_META } from '@/lib/analysis/classify';
import { getGames } from '@/lib/api/client';
import { extractUsername, isValidUsername } from '@/lib/api/shared';
import { useTranslation } from '@/lib/i18n';
import { MoveQualityBadge } from '@/components/MoveQualityBadge';
import { Button, EmptyState, ErrorNote, Panel, PanelHeader, Spinner } from '@/components/ui/Primitives';

const BREAKDOWN_ORDER: readonly MoveClass[] = CLASS_ORDER.filter((id) => id !== 'forced' && id !== 'book');

function ClassBreakdown({ counts }: { counts: ClassCounts }) {
  const { t } = useTranslation();
  const total = BREAKDOWN_ORDER.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {BREAKDOWN_ORDER.map((id) => {
        const meta = MOVE_CLASS_META[id];
        const n = counts[id] ?? 0;
        return (
          <div
            key={id}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2"
            style={{ opacity: n ? 1 : 0.5 }}
          >
            <MoveQualityBadge classification={id} size={18} />
            <span className="min-w-0 flex-1 truncate text-[0.68rem] text-[var(--text-secondary)]">
              {t(`class.${id}`)}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums" style={{ color: meta.color }}>
              {n}
            </span>
          </div>
        );
      })}
      <div className="col-span-2 flex items-center justify-end px-1 text-[0.66rem] text-[var(--text-muted)] sm:col-span-4">
        {t('stats.classifiedMoves', { n: total })}
      </div>
    </div>
  );
}

const WIN = '#7fce6b';
const DRAW = '#9aa3b2';
const LOSS = '#e5484d';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3 text-center">
      <p className="font-mono text-xl font-bold tabular-nums text-white">{value}</p>
      <p className="stat-label mt-0.5">{label}</p>
      {sub ? <p className="mt-0.5 text-[0.62rem] text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  );
}

/** A stacked win / draw / loss bar. */
function WdlBar({ record }: { record: Record3 }) {
  const total = Math.max(1, record.games);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div style={{ width: seg(record.wins), background: WIN }} />
      <div style={{ width: seg(record.draws), background: DRAW }} />
      <div style={{ width: seg(record.losses), background: LOSS }} />
    </div>
  );
}

function RecordCard({ title, record }: { title: string; record: Record3 }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-white">{title}</span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent)]">
          {record.games ? `${record.score.toFixed(1)}%` : '—'}
        </span>
      </div>
      <WdlBar record={record} />
      <div className="flex justify-between font-mono text-[0.66rem] tabular-nums text-[var(--text-muted)]">
        <span style={{ color: WIN }}>
          {record.wins}
          {t('stats.w')}
        </span>
        <span style={{ color: DRAW }}>
          {record.draws}
          {t('stats.d')}
        </span>
        <span style={{ color: LOSS }}>
          {record.losses}
          {t('stats.l')}
        </span>
        <span>{t('stats.gamesN', { n: record.games })}</span>
      </div>
    </div>
  );
}

function OpeningRow({ opening, max }: { opening: OpeningStat; max: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">{opening.name}</span>
      {opening.record ? (
        <div className="w-20 shrink-0">
          <WdlBar record={opening.record} />
        </div>
      ) : (
        <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(opening.count / max) * 100}%` }} />
        </div>
      )}
      <span className="w-8 shrink-0 text-right font-mono text-[0.66rem] tabular-nums text-[var(--text-muted)]">
        {opening.record ? `${opening.record.score.toFixed(0)}%` : opening.count}
      </span>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1.5 px-3 pb-2 pt-3" style={{ height: 120 }}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[0.6rem] tabular-nums text-[var(--text-muted)]">{d.count || ''}</span>
          <div
            className="w-full rounded-t bg-gradient-to-t from-[#5f9bfa] to-[#26c6da]"
            style={{ height: `${(d.count / max) * 80}px`, minHeight: d.count ? 3 : 0 }}
          />
          <span className="truncate text-[0.58rem] text-[var(--text-muted)]" title={d.label}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const { t } = useTranslation();
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [player, setPlayer] = useState('');

  // Online mode: a fetched player's games, computed in memory without importing them.
  const [online, setOnline] = useState<{ username: string; platform: Platform; records: GameRecord[] } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllGames()
      .then((all) => {
        if (!cancelled) setGames(all);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGames = online ? online.records : games;
  const activePlayer = online ? online.username : player;

  const stats = useMemo(
    () => (activeGames ? computeStats(activeGames, activePlayer || undefined) : null),
    [activeGames, activePlayer],
  );

  const applyPlayer = useCallback((value: string) => setPlayer(value), []);

  const fetchOnline = useCallback(
    async (platform: Platform) => {
      const { username } = extractUsername(player);
      if (!isValidUsername(username)) {
        setFetchError(t('players.badUsername'));
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setFetching(true);
      setFetchError(null);
      try {
        const remote = await getGames(platform, username, 100, controller.signal);
        const records = remote
          .map((game) => recordFromRemote(game))
          .filter((record): record is GameRecord => record !== null);
        setOnline({ username, platform, records });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setFetchError(err instanceof Error ? err.message : t('library.dbError'));
        }
      } finally {
        setFetching(false);
      }
    },
    [player, t],
  );

  const clearOnline = useCallback(() => {
    setOnline(null);
    setFetchError(null);
  }, []);

  if (!games || !stats) {
    return (
      <Panel className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </Panel>
    );
  }

  const maxOpening = Math.max(1, ...stats.topOpenings.map((o) => o.count));
  const pct = (part: number) => (stats.total > 0 ? Math.round((part / stats.total) * 100) : 0);

  const header = (
    <Panel className="p-3">
      <PanelHeader
        title={t('stats.title')}
        subtitle={
          online
            ? t('stats.onlineSubtitle', { name: online.username, n: stats.total })
            : t('stats.subtitle', { n: stats.total })
        }
        actions={online ? <Button onClick={clearOnline}>{t('stats.backToLibrary')}</Button> : null}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs text-sm"
          placeholder={t('stats.playerPlaceholder')}
          value={player}
          onChange={(event) => applyPlayer(event.target.value)}
          spellCheck={false}
        />
        <span className="text-[0.68rem] text-[var(--text-muted)]">{t('stats.orFetch')}</span>
        <Button onClick={() => void fetchOnline('lichess')} disabled={fetching || !player.trim()}>
          {fetching ? <Spinner /> : t('players.lichess')}
        </Button>
        <Button onClick={() => void fetchOnline('chesscom')} disabled={fetching || !player.trim()}>
          {fetching ? <Spinner /> : t('players.chesscom')}
        </Button>
      </div>
      <p className="mt-1.5 text-[0.68rem] text-[var(--text-muted)]">{t('stats.playerHint')}</p>
      {fetchError ? (
        <div className="mt-2">
          <ErrorNote>{fetchError}</ErrorNote>
        </div>
      ) : null}
    </Panel>
  );

  if (stats.total === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Panel>
          <EmptyState
            title={online ? t('players.noGames') : t('stats.emptyTitle')}
            body={online ? '' : t('stats.emptyBody')}
            icon="📊"
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Tile label={t('stats.total')} value={String(stats.total)} />
        <Tile
          label={t('stats.decisive')}
          value={`${pct(stats.decisive)}%`}
          sub={t('stats.gamesN', { n: stats.decisive })}
        />
        <Tile
          label={t('stats.draws')}
          value={`${pct(stats.draws)}%`}
          sub={t('stats.gamesN', { n: stats.draws })}
        />
        <Tile label={t('stats.whiteWins')} value={String(stats.results.white)} />
        <Tile label={t('stats.blackWins')} value={String(stats.results.black)} />
        <Tile label={t('stats.reviewed')} value={`${stats.reviewed}/${stats.total}`} />
      </div>

      {stats.player ? (
        <Panel className="p-3">
          <PanelHeader title={t('stats.perspective', { name: stats.player.name })} subtitle={t('stats.perspectiveSub')} />
          {stats.player.games === 0 ? (
            <p className="p-3 text-xs text-[var(--text-muted)]">{t('stats.noPlayerGames')}</p>
          ) : (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <RecordCard title={t('stats.overall')} record={stats.player.overall} />
                <RecordCard title={t('stats.asWhite')} record={stats.player.asWhite} />
                <RecordCard title={t('stats.asBlack')} record={stats.player.asBlack} />
              </div>
              {stats.player.reviewedGames > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-black/20 px-3 py-2 text-xs">
                  <span className="stat-label">{t('stats.accuracyLabel')}</span>
                  <span>
                    {t('stats.overall')}{' '}
                    <b className="font-mono text-[var(--accent)]">{stats.player.accuracy.overall}%</b>
                  </span>
                  {stats.player.accuracy.white !== null ? (
                    <span>
                      {t('stats.asWhite')} <b className="font-mono text-white">{stats.player.accuracy.white}%</b>
                    </span>
                  ) : null}
                  {stats.player.accuracy.black !== null ? (
                    <span>
                      {t('stats.asBlack')} <b className="font-mono text-white">{stats.player.accuracy.black}%</b>
                    </span>
                  ) : null}
                  <span className="text-[var(--text-muted)]">
                    · {t('stats.fromReviewed', { n: stats.player.reviewedGames })}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-[0.66rem] text-[var(--text-muted)]">{t('stats.notReviewed')}</p>
              )}

              {stats.player.reviewedGames > 0 ? (
                <div className="mt-3">
                  <p className="stat-label mb-2">{t('stats.moveQuality')}</p>
                  <ClassBreakdown counts={stats.player.classCounts} />
                </div>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title={stats.player ? t('stats.bestOpenings') : t('stats.topOpenings')}
            subtitle={stats.player ? t('stats.byScore') : t('stats.byFrequency')}
          />
          <div className="divide-y divide-white/[0.04]">
            {(stats.player && stats.player.bestOpenings.length
              ? stats.player.bestOpenings
              : stats.topOpenings
            ).map((opening) => (
              <OpeningRow key={opening.key} opening={opening} max={maxOpening} />
            ))}
          </div>
        </Panel>

        {stats.player && stats.player.worstOpenings.length ? (
          <Panel className="overflow-hidden">
            <PanelHeader title={t('stats.worstOpenings')} subtitle={t('stats.byScore')} />
            <div className="divide-y divide-white/[0.04]">
              {stats.player.worstOpenings.map((opening) => (
                <OpeningRow key={opening.key} opening={opening} max={maxOpening} />
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            <PanelHeader title={t('stats.byRating')} subtitle={t('stats.byRatingSub')} />
            <BarChart data={stats.ratingBuckets} />
          </Panel>
        )}
      </div>

      {stats.perYear.length > 0 ? (
        <Panel className="overflow-hidden">
          <PanelHeader title={t('stats.perYear')} subtitle={t('stats.perYearSub')} />
          <BarChart data={stats.perYear.map((y) => ({ label: String(y.year), count: y.count }))} />
        </Panel>
      ) : null}
    </div>
  );
}
