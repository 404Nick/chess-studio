'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameFilter, GameRecord } from '@/lib/games/gamesDb';
import { clearGames, countGames, deleteGame, importPgnFile, queryGames } from '@/lib/games/gamesDb';
import { useBatchReview } from '@/hooks/useBatchReview';
import { useTranslation } from '@/lib/i18n';
import { useGame } from '@/store/gameStore';
import { useSettings } from '@/store/settingsStore';
import { Button, EmptyState, ErrorNote, Panel, PanelHeader, ProgressBar, Select, Spinner } from '@/components/ui/Primitives';

const RESULT_OPTIONS = [
  { value: '', key: 'library.any' },
  { value: '1-0', key: 'library.whiteWon' },
  { value: '0-1', key: 'library.blackWon' },
  { value: '1/2-1/2', key: 'library.drawn' },
] as const;

const ORIGIN_OPTIONS = [
  { value: '', key: 'library.any' },
  { value: 'lichess', key: 'players.lichess' },
  { value: 'chesscom', key: 'players.chesscom' },
  { value: 'local', key: 'library.local' },
] as const;

function ResultTag({ result }: { result: string }) {
  const label = result === '1/2-1/2' ? '½-½' : result;
  const tone =
    result === '1-0' ? 'text-[#e8ecf5]' : result === '0-1' ? 'text-[#6ea8fe]' : 'text-[var(--text-muted)]';
  return <span className={`font-mono text-[0.68rem] font-bold tabular-nums ${tone}`}>{label}</span>;
}

/** Local date (yyyy-mm-dd) -> epoch ms, optionally snapped to the end of the day. */
function dayToEpoch(value: string, endOfDay = false): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return undefined;
  return endOfDay ? ms + 86_399_999 : ms;
}

export default function LibraryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const loadPgn = useGame((state) => state.loadPgn);

  const [records, setRecords] = useState<GameRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [text, setText] = useState('');
  const [eco, setEco] = useState('');
  const [result, setResult] = useState('');
  const [origin, setOrigin] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fen, setFen] = useState('');

  // Import
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const batch = useBatchReview();
  const reviewDepth = useSettings((state) => state.reviewDepth);

  const filter = useMemo<GameFilter>(
    () => ({
      text: text.trim() || undefined,
      eco: eco.trim() || undefined,
      result: result || undefined,
      origin: (origin as GameFilter['origin']) || undefined,
      dateFrom: dayToEpoch(dateFrom),
      dateTo: dayToEpoch(dateTo, true),
      fen: fen.trim() || undefined,
    }),
    [text, eco, result, origin, dateFrom, dateTo, fen],
  );

  const refresh = useCallback(
    async (activeFilter: GameFilter) => {
      setLoading(true);
      setError(null);
      try {
        const [rows, count] = await Promise.all([queryGames(activeFilter), countGames()]);
        setRecords(rows);
        setTotal(count);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('library.dbError'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Debounced live search whenever a filter changes.
  useEffect(() => {
    const id = window.setTimeout(() => void refresh(filter), 200);
    return () => window.clearTimeout(id);
  }, [filter, refresh]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }, []);

  const runImport = useCallback(
    async (pgn: string) => {
      const value = pgn.trim();
      if (!value) return;
      setImportBusy(true);
      setError(null);
      try {
        const added = await importPgnFile(value, { origin: 'local' });
        flash(added > 0 ? t('library.importedN', { n: added }) : t('library.importedNone'));
        setImportText('');
        await refresh(filter);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('library.dbError'));
      } finally {
        setImportBusy(false);
      }
    },
    [filter, flash, refresh, t],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const content = await file.text();
      await runImport(content);
      if (fileRef.current) fileRef.current.value = '';
    },
    [runImport],
  );

  const openGame = useCallback(
    (record: GameRecord) => {
      if (loadPgn(record.pgn, null)) router.push('/');
    },
    [loadPgn, router],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteGame(id);
      await refresh(filter);
    },
    [filter, refresh],
  );

  const wipe = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm(t('library.clearConfirm'))) return;
    await clearGames();
    await refresh(filter);
  }, [filter, refresh, t]);

  const resetFilters = useCallback(() => {
    setText('');
    setEco('');
    setResult('');
    setOrigin('');
    setDateFrom('');
    setDateTo('');
    setFen('');
  }, []);

  const unreviewed = useMemo(() => records.filter((record) => !record.reviewedAt).length, [records]);

  const startBatch = useCallback(async () => {
    const pending = records.filter((record) => !record.reviewedAt);
    if (pending.length === 0) return;
    await batch.start(pending, Math.min(reviewDepth, 12));
    await refresh(filter);
  }, [records, batch, reviewDepth, refresh, filter]);

  const hasFilters = Boolean(text || eco || result || origin || dateFrom || dateTo || fen);

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
      {/* ============================== filters + import ============================== */}
      <div className="flex flex-col gap-3">
        <Panel className="space-y-3 p-3">
          <PanelHeader title={t('library.filters')} subtitle={t('library.stored', { n: total })} />

          <input
            className="input text-xs"
            placeholder={t('library.searchPlaceholder')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="input text-xs"
              placeholder={t('library.eco')}
              value={eco}
              onChange={(event) => setEco(event.target.value)}
              spellCheck={false}
            />
            <Select
              value={result}
              onChange={setResult}
              options={RESULT_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select
              value={origin}
              onChange={setOrigin}
              options={ORIGIN_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }))}
            />
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date"
                className="input px-2 text-[0.66rem]"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                title={t('library.dateFrom')}
              />
              <input
                type="date"
                className="input px-2 text-[0.66rem]"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                title={t('library.dateTo')}
              />
            </div>
          </div>

          <input
            className="input font-mono text-[0.66rem]"
            placeholder={t('library.fenPlaceholder')}
            value={fen}
            onChange={(event) => setFen(event.target.value)}
            spellCheck={false}
          />

          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
            >
              {t('library.clearFilters')}
            </button>
          ) : null}
        </Panel>

        <Panel className="space-y-2 p-3">
          <p className="panel-title">{t('library.import')}</p>
          <textarea
            className="input h-24 resize-none font-mono text-[0.66rem]"
            placeholder={t('library.pastePgn')}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void runImport(importText)}
              disabled={importBusy || !importText.trim()}
            >
              {importBusy ? <Spinner /> : t('library.addToLibrary')}
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={importBusy}>
              {t('library.uploadFile')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.txt,application/x-chess-pgn,text/plain"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </div>

          <AnimatePresence>
            {notice ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[0.68rem] text-[var(--accent)]"
              >
                {notice}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {total > 0 ? (
            <button
              type="button"
              onClick={() => void wipe()}
              className="text-[0.68rem] text-[#e5484d]/80 hover:text-[#e5484d]"
            >
              {t('library.clearAll')}
            </button>
          ) : null}
        </Panel>
      </div>

      {/* ============================== results ============================== */}
      <Panel className="flex min-h-[70vh] flex-col overflow-hidden">
        <PanelHeader
          title={t('library.title')}
          subtitle={t('library.showing', { n: records.length })}
          actions={
            batch.running ? (
              <Button variant="ghost" onClick={batch.cancel}>
                <Spinner />
                {t('common.cancel')}
              </Button>
            ) : unreviewed > 0 ? (
              <Button onClick={() => void startBatch()}>{t('library.reviewAll', { n: unreviewed })}</Button>
            ) : loading ? (
              <Spinner />
            ) : null
          }
        />

        {batch.running ? (
          <div className="space-y-1.5 border-b border-white/[0.06] px-3 py-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>{t('library.reviewing')}</span>
              <span className="font-mono tabular-nums">
                {batch.done}/{batch.total}
              </span>
            </div>
            <ProgressBar value={batch.done} max={batch.total} />
          </div>
        ) : null}

        {batch.error ? (
          <div className="p-3">
            <ErrorNote>{batch.error}</ErrorNote>
          </div>
        ) : null}

        {error ? (
          <div className="p-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}

        {!loading && records.length === 0 && !error ? (
          <EmptyState
            title={total === 0 ? t('library.emptyTitle') : t('library.noMatches')}
            body={total === 0 ? t('library.emptyBody') : t('library.noMatchesBody')}
            icon="♜"
          />
        ) : null}

        <div className="min-h-0 flex-1 divide-y divide-white/[0.04] overflow-y-auto">
          {records.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.05]"
            >
              <button type="button" onClick={() => openGame(record)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                  {record.white}
                  {record.whiteElo ? <span className="text-[var(--text-muted)]"> ({record.whiteElo})</span> : null}
                  <span className="mx-1 text-[var(--text-muted)]">{t('board.vs')}</span>
                  {record.black}
                  {record.blackElo ? <span className="text-[var(--text-muted)]"> ({record.blackElo})</span> : null}
                </p>
                <p className="mt-0.5 truncate text-[0.66rem] text-[var(--text-muted)]">
                  {record.eco ? `${record.eco} · ` : ''}
                  {record.opening ?? t('library.unknownOpening')}
                  {record.date ? ` · ${record.date}` : ''}
                  {` · ${Math.ceil(record.ply / 2)} ${t('library.moves')}`}
                  {record.origin !== 'local' ? ` · ${record.origin}` : ''}
                </p>
              </button>
              {record.accuracyWhite !== undefined ? (
                <span
                  className="hidden shrink-0 font-mono text-[0.62rem] tabular-nums text-[var(--text-muted)] sm:inline"
                  title={t('library.accuracy')}
                >
                  {record.accuracyWhite}/{record.accuracyBlack}
                </span>
              ) : null}
              <ResultTag result={record.result} />
              <button
                type="button"
                onClick={() => void remove(record.id)}
                aria-label={t('library.delete')}
                title={t('library.delete')}
                className="text-[var(--text-muted)] transition-colors hover:text-[#e5484d]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
