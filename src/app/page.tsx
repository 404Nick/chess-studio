'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardShape, MoveClass, MoveNode, Square } from '@/types';
import { assessSingleMove } from '@/lib/analysis/review';
import { playMoveSound, playSound } from '@/lib/sound/sounds';
import { fenTurn, validateFen } from '@/lib/chess/fen';
import { describeResult, parseUci } from '@/lib/chess/line';
import { chessAtCursor, childrenOf } from '@/lib/chess/tree';
import { bookPlyCount, findOpening } from '@/lib/openings';
import { getTheme, SHAPE_COLORS } from '@/lib/theme/boardThemes';
import { useAnalyseOnce, useEngine, useLiveAnalysis } from '@/hooks/useStockfish';
import { useBoardShortcuts } from '@/hooks/useBoardShortcuts';
import { useTranslation } from '@/lib/i18n';
import { currentNode, currentShapes, fenOf, isGameOver, mainlineMoves, sanToCursor, useGame } from '@/store/gameStore';
// `sanToCursor` is a plain helper (it allocates) and is derived with useMemo below.
import { useSettings } from '@/store/settingsStore';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { BoardControls, ImportExportBar } from '@/components/BoardControls';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { EvalBar } from '@/components/EvalBar';
import { MoveTree } from '@/components/MoveTree';
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

  const tree = useGame((state) => state.tree);
  const headers = useGame((state) => state.headers);
  const orientation = useGame((state) => state.orientation);
  const shapes = useGame(currentShapes);
  const node = useGame(currentNode);
  const sanMoves = useMemo(() => sanToCursor(tree), [tree]);
  const moveCount = useMemo(() => mainlineMoves(tree).length, [tree]);

  const play = useGame((state) => state.play);
  const goTo = useGame((state) => state.goTo);
  const first = useGame((state) => state.first);
  const previous = useGame((state) => state.previous);
  const next = useGame((state) => state.next);
  const last = useGame((state) => state.last);
  const prevVariation = useGame((state) => state.prevVariation);
  const nextVariation = useGame((state) => state.nextVariation);
  const promote = useGame((state) => state.promote);
  const deleteNode = useGame((state) => state.deleteNode);
  const flip = useGame((state) => state.flip);
  const reset = useGame((state) => state.reset);
  const loadPgn = useGame((state) => state.loadPgn);
  const setShapes = useGame((state) => state.setShapes);
  const setAssessment = useGame((state) => state.setAssessment);
  const setComment = useGame((state) => state.setComment);

  const [tab, setTab] = useState<PanelTab>('analysis');
  const [shapeColor, setShapeColor] = useState(SHAPE_COLORS[0].value);

  const fen = useGame(fenOf);
  const turn = useMemo(() => fenTurn(fen), [fen]);
  const canNext = childrenOf(tree, tree.cursor).length > 0;

  const engine = useEngine(settings.hashMb);

  // Hold live analysis back until a tick after the first paint. Kicking a search off
  // inside the same commit that hydrates the store and mounts the board can pile enough
  // synchronous updates onto React to trip its nested-update ceiling.
  const [analysisArmed, setAnalysisArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAnalysisArmed(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  // Cloud eval can serve a position even before the local engine finishes booting.
  const { analysis, thinking, source } = useLiveAnalysis(fen, {
    enabled:
      analysisArmed && settings.liveAnalysis && (engine.ready || settings.cloudEval || settings.tablebase),
    depth: settings.engineDepth,
    multiPv: settings.multiPv,
    cloudEval: settings.cloudEval,
    tablebase: settings.tablebase,
  });

  const analyseOnce = useAnalyseOnce();
  const analysisRef = useRef(analysis);
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  const outcome = useMemo(() => describeResult(chessAtCursor(tree)), [tree]);

  /* ---------------- playing moves ---------------- */

  /** Classifies a freshly played move in the background so the badge can pop in. */
  const classifyLatest = useCallback(
    async (played: MoveNode) => {
      const quickDepth = Math.min(settings.engineDepth, 14);
      const cached = analysisRef.current;

      try {
        const before =
          cached.fen === played.fenBefore && cached.lines.length > 0 && cached.depth >= quickDepth - 2
            ? cached
            : await analyseOnce(played.fenBefore, quickDepth, 2);
        const after = await analyseOnce(played.fenAfter, quickDepth, 1);

        const history = sanToCursor(useGame.getState().tree);
        const match = findOpening(history);

        const assessment = assessSingleMove({
          node: played,
          before,
          after,
          bookPlies: bookPlyCount(history),
          openingName: match?.entry.name ?? null,
          lang: useSettings.getState().language,
        });
        setAssessment(played.id, assessment);

        // A short "uh-oh" cue a beat after the move lands, once the verdict is in.
        const audio = useSettings.getState();
        if (audio.soundEnabled && assessment.classification === 'blunder') {
          playSound('blunder', audio.soundVolume);
        }
      } catch {
        // Engine unavailable — the move still stands, just without a verdict.
      }
    },
    [analyseOnce, setAssessment, settings.engineDepth],
  );

  /** Plays the move sound and kicks off live classification for a freshly played move. */
  const afterPlay = useCallback(
    (played: MoveNode | null) => {
      if (!played) return;
      const s = useSettings.getState();
      if (s.soundEnabled) {
        playMoveSound(played, { volume: s.soundVolume, gameOver: isGameOver(useGame.getState()) });
      }
      if (s.liveAnalysis && engine.ready) {
        void classifyLatest(played);
      }
    },
    [engine.ready, classifyLatest],
  );

  const handleMove = useCallback(
    (move: BoardMove): boolean => {
      const played = play(move);
      if (!played) return false;
      afterPlay(played);
      return true;
    },
    [play, afterPlay],
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
      afterPlay(play(san));
    },
    [play, afterPlay],
  );

  /* ---------------- shapes & navigation ---------------- */

  const handleShapes = useCallback(
    (nextShapes: BoardShape[]) => setShapes(tree.cursor, nextShapes),
    [setShapes, tree.cursor],
  );

  useBoardShortcuts({
    onPrevious: previous,
    onNext: next,
    onFirst: first,
    onLast: last,
    onFlip: flip,
    onUp: prevVariation,
    onDown: nextVariation,
  });

  /* ---------------- derived board props ---------------- */

  const lastMove = node ? { from: node.from as Square, to: node.to as Square } : null;

  // "Clear" hides the engine's best-move arrow too, so the board goes fully clean;
  // it comes back on the next move or navigation (i.e. whenever the position changes).
  const [hideEngineArrow, setHideEngineArrow] = useState(false);
  useEffect(() => setHideEngineArrow(false), [fen]);

  const bestMove =
    settings.showBestMoveArrow && !outcome.over && !hideEngineArrow
      ? (analysis.lines[0]?.pv[0] ?? null)
      : null;

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
              canPrevious={tree.cursor !== null}
              canNext={canNext}
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
                onClick={() => {
                  setShapes(tree.cursor, []);
                  setHideEngineArrow(true);
                }}
                className="ml-1 text-[0.68rem] text-[var(--text-muted)] hover:text-white"
              >
                {t('board.clearArrows')}
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
            tree={tree}
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
              source={source}
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
            subtitle={t('moves.count', { n: moveCount })}
            actions={
              node ? (
                <button
                  type="button"
                  onClick={() => deleteNode(node.id)}
                  className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
                >
                  {t('board.deleteFromHere')}
                </button>
              ) : null
            }
          />
          <MoveTree
            tree={tree}
            onSelect={goTo}
            onPromote={promote}
            onDelete={deleteNode}
            showBadges={settings.showClassificationBadges}
          />
          {node ? (
            <div className="border-t border-white/[0.06] p-2">
              <input
                className="input text-xs"
                placeholder={t('moves.commentPlaceholder')}
                value={node.comment ?? ''}
                onChange={(event) => setComment(node.id, event.target.value)}
              />
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
