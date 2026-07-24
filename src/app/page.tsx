'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardShape, MoveClass, Square } from '@/types';
import { assessSingleMove } from '@/lib/analysis/review';
import { fenTurn, validateFen } from '@/lib/chess/fen';
import { currentFen, describeResult, chessAtCursor, parseUci } from '@/lib/chess/line';
import { bookPlyCount, findOpening } from '@/lib/openings';
import { getTheme, SHAPE_COLORS } from '@/lib/theme/boardThemes';
import { useAnalyseOnce, useEngine, useLiveAnalysis } from '@/hooks/useStockfish';
import { useBoardShortcuts } from '@/hooks/useBoardShortcuts';
import { useTranslation } from '@/lib/i18n';
import { currentNode, currentShapes, sanUpToCursor, useGame } from '@/store/gameStore';
// `sanUpToCursor` is a plain helper (it allocates) and is derived with useMemo below.
import { useSettings } from '@/store/settingsStore';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { BoardControls, ImportExportBar } from '@/components/BoardControls';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { EvalBar } from '@/components/EvalBar';
import { MoveList } from '@/components/MoveList';
import { OpeningBook } from '@/components/OpeningBook';
import { ProfileFetch } from '@/components/ProfileFetch';
import { ThemePicker } from '@/components/ThemePicker';
import { Panel, PanelHeader, Tabs, type TabItem } from '@/components/ui/Primitives';

type PanelTab = 'analysis' | 'opening' | 'players' | 'board';

const TAB_KEYS: readonly { id: PanelTab; key: string }[] = [
  { id: 'analysis', key: 'tab.analysis' },
  { id: 'opening', key: 'tab.opening' },
  { id: 'players', key: 'tab.players' },
  { id: 'board', key: 'tab.board' },
];

export default function AnalysisPage() {
  const settings = useSettings();
  const { t } = useTranslation();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);
  const tabItems = useMemo<TabItem<PanelTab>[]>(
    () => TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.key) })),
    [t],
  );

  const line = useGame((state) => state.line);
  const headers = useGame((state) => state.headers);
  const orientation = useGame((state) => state.orientation);
  const shapes = useGame(currentShapes);
  const node = useGame(currentNode);
  const sanMoves = useMemo(() => sanUpToCursor(line), [line]);

  const play = useGame((state) => state.play);
  const navigate = useGame((state) => state.navigate);
  const first = useGame((state) => state.first);
  const previous = useGame((state) => state.previous);
  const next = useGame((state) => state.next);
  const last = useGame((state) => state.last);
  const flip = useGame((state) => state.flip);
  const reset = useGame((state) => state.reset);
  const loadPgn = useGame((state) => state.loadPgn);
  const setShapes = useGame((state) => state.setShapes);
  const setAssessment = useGame((state) => state.setAssessment);
  const setComment = useGame((state) => state.setComment);

  const [tab, setTab] = useState<PanelTab>('analysis');
  const [shapeColor, setShapeColor] = useState(SHAPE_COLORS[0].value);

  const fen = useMemo(() => currentFen(line), [line]);
  const turn = useMemo(() => fenTurn(fen), [fen]);

  const engine = useEngine(settings.hashMb);

  // Hold live analysis back until a tick after the first paint. Kicking a search off
  // inside the same commit that hydrates the store and mounts the board can pile enough
  // synchronous updates onto React to trip its nested-update ceiling.
  const [analysisArmed, setAnalysisArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAnalysisArmed(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  const { analysis, thinking } = useLiveAnalysis(fen, {
    enabled: analysisArmed && settings.liveAnalysis && engine.ready,
    depth: settings.engineDepth,
    multiPv: settings.multiPv,
  });

  const analyseOnce = useAnalyseOnce();
  const analysisRef = useRef(analysis);
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  const outcome = useMemo(() => describeResult(chessAtCursor(line)), [line]);

  /* ---------------- playing moves ---------------- */

  /** Classifies a freshly played move in the background so the badge can pop in. */
  const classifyLatest = useCallback(
    async (index: number) => {
      const played = useGame.getState().line.moves[index];
      if (!played) return;

      const quickDepth = Math.min(settings.engineDepth, 14);
      const cached = analysisRef.current;

      try {
        const before =
          cached.fen === played.fenBefore && cached.lines.length > 0 && cached.depth >= quickDepth - 2
            ? cached
            : await analyseOnce(played.fenBefore, quickDepth, 2);
        const after = await analyseOnce(played.fenAfter, quickDepth, 1);

        const history = useGame
          .getState()
          .line.moves.slice(0, index + 1)
          .map((move) => move.san);
        const match = findOpening(history);

        setAssessment(
          index,
          assessSingleMove({
            node: played,
            before,
            after,
            bookPlies: bookPlyCount(history),
            openingName: match?.entry.name ?? null,
          }),
        );
      } catch {
        // Engine unavailable — the move still stands, just without a verdict.
      }
    },
    [analyseOnce, setAssessment, settings.engineDepth],
  );

  const handleMove = useCallback(
    (move: BoardMove): boolean => {
      const played = play(move);
      if (!played) return false;
      if (settings.liveAnalysis && engine.ready) {
        void classifyLatest(useGame.getState().line.cursor);
      }
      return true;
    },
    [play, settings.liveAnalysis, engine.ready, classifyLatest],
  );

  const playUci = useCallback(
    (uci: string) => {
      const parsed = parseUci(uci);
      if (!parsed) return;
      handleMove(parsed);
    },
    [handleMove],
  );

  const playSan = useCallback(
    (san: string) => {
      const played = play(san);
      if (played && settings.liveAnalysis && engine.ready) {
        void classifyLatest(useGame.getState().line.cursor);
      }
    },
    [play, settings.liveAnalysis, engine.ready, classifyLatest],
  );

  /* ---------------- shapes & navigation ---------------- */

  const handleShapes = useCallback(
    (nextShapes: BoardShape[]) => setShapes(line.cursor, nextShapes),
    [setShapes, line.cursor],
  );

  useBoardShortcuts({
    onPrevious: previous,
    onNext: next,
    onFirst: first,
    onLast: last,
    onFlip: flip,
  });

  /* ---------------- derived board props ---------------- */

  const lastMove = node ? { from: node.from as Square, to: node.to as Square } : null;

  const bestMove =
    settings.showBestMoveArrow && !outcome.over ? (analysis.lines[0]?.pv[0] ?? null) : null;

  const badge: { square: Square; classification: MoveClass } | null =
    settings.showClassificationBadges && node?.assessment
      ? { square: node.to as Square, classification: node.assessment.classification }
      : null;

  const evalScore = analysis.lines[0]?.score ?? node?.assessment?.scoreAfter ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_27rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]">
      {/* ============================== board column ============================== */}
      <div className="flex flex-col gap-3">
        <Panel className="p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {headers.white ?? t('board.white')}
                <span className="mx-2 text-[var(--text-muted)]">{t('board.vs')}</span>
                {headers.black ?? t('board.black')}
              </p>
              <p className="truncate text-[0.68rem] text-[var(--text-muted)]">
                {outcome.over
                  ? t(outcome.reasonKey)
                  : t(turn === 'w' ? 'board.whiteToMove' : 'board.blackToMove')}
                {headers.opening ? ` · ${headers.opening}` : ''}
              </p>
            </div>

            <BoardControls
              onFirst={first}
              onPrevious={previous}
              onNext={next}
              onLast={last}
              onFlip={flip}
              canPrevious={line.cursor >= 0}
              canNext={line.cursor < line.moves.length - 1}
            />
          </div>

          <div className="flex gap-2.5">
            {settings.showEvalBar ? (
              <EvalBar score={evalScore} orientation={orientation} thinking={thinking} />
            ) : null}

            <div className="min-w-0 flex-1">
              <BoardSurface
                fen={fen}
                orientation={orientation}
                theme={theme}
                pieceStyle={settings.pieceStyle}
                onMove={handleMove}
                lastMove={lastMove}
                shapes={shapes}
                onShapesChange={handleShapes}
                shapeColor={shapeColor}
                bestMove={bestMove}
                badge={badge}
                showCoordinates={settings.showCoordinates}
                showLegalMoves={settings.showLegalMoves}
                animationMs={settings.animationMs}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="stat-label mr-1">{t('board.draw')}</span>
              {SHAPE_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setShapeColor(color.value)}
                  aria-label={`${color.label} arrows`}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: color.value,
                    borderColor: shapeColor === color.value ? '#fff' : 'transparent',
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => setShapes(line.cursor, [])}
                className="ml-1 text-[0.68rem] text-[var(--text-muted)] hover:text-white"
              >
                {t('common.clear')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => reset()}
              className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
            >
              {t('board.newGame')}
            </button>
          </div>
        </Panel>

        <Panel className="p-3">
          <ImportExportBar
            line={line}
            headers={headers}
            onImportPgn={(pgn) => loadPgn(pgn)}
            onSetFen={(value) => {
              // Only start from positions the engine and board can actually handle.
              if (validateFen(value).playable) reset(value);
            }}
            filename={
              headers.white && headers.black ? `${headers.white}-vs-${headers.black}` : 'chess-studio-analysis'
            }
          />
        </Panel>
      </div>

      {/* ============================== side panel ============================== */}
      <div className="flex min-h-0 flex-col gap-3">
        <Tabs<PanelTab> items={tabItems} value={tab} onChange={setTab} />

        <Panel className="flex max-h-[calc(100vh-16rem)] min-h-[26rem] flex-col overflow-hidden">
          {tab === 'analysis' ? (
            <AnalysisPanel
              analysis={analysis}
              thinking={thinking}
              turn={turn}
              onPlayMove={playUci}
              engineUnavailable={!engine.ready}
            />
          ) : null}
          {tab === 'opening' ? (
            <OpeningBook sanMoves={sanMoves} fen={fen} onPlayUci={playUci} onPlaySan={playSan} />
          ) : null}
          {tab === 'players' ? <ProfileFetch /> : null}
          {tab === 'board' ? <ThemePicker /> : null}
        </Panel>

        <Panel className="flex max-h-[26rem] min-h-[14rem] flex-col overflow-hidden">
          <PanelHeader
            title={t('moves.title')}
            subtitle={t('moves.count', { n: line.moves.length })}
            actions={
              line.cursor >= 0 ? (
                <button
                  type="button"
                  onClick={() => useGame.getState().truncateFrom(line.cursor)}
                  className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
                >
                  {t('board.deleteFromHere')}
                </button>
              ) : null
            }
          />
          <MoveList line={line} onSelect={navigate} showBadges={settings.showClassificationBadges} />
          {line.cursor >= 0 ? (
            <div className="border-t border-white/[0.06] p-2">
              <input
                className="input text-xs"
                placeholder={t('moves.commentPlaceholder')}
                value={node?.comment ?? ''}
                onChange={(event) => setComment(line.cursor, event.target.value)}
              />
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
