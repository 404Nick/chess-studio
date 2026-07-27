'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo } from 'react';
import type { Color, MoveClass, PositionAnalysis } from '@/types';
import { MOVE_CLASS_META } from '@/lib/analysis/classify';
import type { AnalysisSource } from '@/hooks/useStockfish';
import { getCachedReview, lineKey } from '@/lib/games/gamesDb';
import { useGameReview } from '@/hooks/useGameReview';
import { useClassLabel, useTranslation } from '@/lib/i18n';
import { currentNode, useGame } from '@/store/gameStore';
import { useSettings } from '@/store/settingsStore';
import { EngineLines } from './EngineLines';
import { GameReviewSummary } from './GameReviewSummary';
import { MoveQualityBadge } from './MoveQualityBadge';
import { Button, ErrorNote, PanelHeader, ProgressBar, Spinner } from './ui/Primitives';

export function AnalysisPanel({
  analysis,
  thinking,
  turn,
  onPlayMove,
  engineUnavailable,
  source = null,
}: {
  analysis: PositionAnalysis;
  thinking: boolean;
  turn: Color;
  onPlayMove(uci: string): void;
  engineUnavailable: boolean;
  source?: AnalysisSource;
}) {
  const line = useGame((state) => state.line);
  const review = useGame((state) => state.review);
  const navigate = useGame((state) => state.navigate);
  const applyReview = useGame((state) => state.applyReview);
  const node = useGame(currentNode);

  // Restore a previously computed review from IndexedDB when this game is reopened,
  // so we don't re-grind the engine over a game we've already analysed. Keyed by the
  // line's content hash, which is stable across navigation.
  const reviewKey = useMemo(() => (line.moves.length ? lineKey(line) : ''), [line]);
  useEffect(() => {
    if (review || !reviewKey) return undefined;
    let cancelled = false;
    getCachedReview(useGame.getState().line)
      .then((cached) => {
        if (cancelled || !cached) return;
        // Keep the user where they are in the game.
        applyReview({ ...cached.line, cursor: useGame.getState().line.cursor }, cached.review);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reviewKey, review, applyReview]);

  const reviewDepth = useSettings((state) => state.reviewDepth);
  const engineDepth = useSettings((state) => state.engineDepth);

  const gameReview = useGameReview();
  const { t } = useTranslation();
  const assessmentLabel = useClassLabel(node?.assessment?.classification ?? 'good');

  const startReview = useCallback(() => {
    void gameReview.start(line, reviewDepth);
  }, [gameReview, line, reviewDepth]);

  // Indices of every sub-par move, for the "jump to mistakes" stepper.
  const mistakeIndices = useMemo(() => {
    const flagged = new Set<MoveClass>(['inaccuracy', 'mistake', 'blunder']);
    return line.moves.reduce<number[]>((acc, move, index) => {
      if (move.assessment && flagged.has(move.assessment.classification)) acc.push(index);
      return acc;
    }, []);
  }, [line]);

  const gotoMistake = useCallback(
    (direction: 1 | -1) => {
      if (mistakeIndices.length === 0) return;
      const cursor = line.cursor;
      const target =
        direction === 1
          ? (mistakeIndices.find((index) => index > cursor) ?? mistakeIndices[0])
          : ([...mistakeIndices].reverse().find((index) => index < cursor) ??
            mistakeIndices[mistakeIndices.length - 1]);
      navigate(target);
    },
    [mistakeIndices, line.cursor, navigate],
  );

  const assessment = node?.assessment ?? null;
  const meta = assessment ? MOVE_CLASS_META[assessment.classification] : null;

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader
        title={t('analysis.title')}
        subtitle={engineUnavailable ? t('engine.unavailable') : t('analysis.subtitle', { depth: engineDepth })}
        actions={
          gameReview.running ? (
            <Button variant="ghost" onClick={gameReview.cancel}>
              <Spinner />
              {t('common.cancel')}
            </Button>
          ) : (
            <Button variant="primary" onClick={startReview} disabled={engineUnavailable || line.moves.length === 0}>
              {review ? t('analysis.rerun') : t('analysis.review')}
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {gameReview.running ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>{t('analysis.analysing')}</span>
              <span className="font-mono tabular-nums">
                {gameReview.done}/{gameReview.total}
              </span>
            </div>
            <ProgressBar value={gameReview.done} max={gameReview.total} />
          </div>
        ) : null}

        {gameReview.error ? <ErrorNote>{gameReview.error}</ErrorNote> : null}

        {/* ---- Why this move? ----
         * A plain keyed motion.div (not AnimatePresence mode="wait"): remounting on
         * node.id change makes the card always reflect the *current* move. mode="wait"
         * held the exiting card until its exit finished, leaving the panel a move
         * behind the board on every navigation. */}
        {assessment && meta && node ? (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: meta.ring,
                background: `linear-gradient(160deg, ${meta.color}1f, rgba(255,255,255,0.015))`,
              }}
            >
              <div className="flex items-center gap-2 px-3 pt-3">
                <MoveQualityBadge classification={assessment.classification} size={22} />
                <span className="font-mono text-sm font-semibold text-white">{node.san}</span>
                <span className="text-sm font-semibold" style={{ color: meta.color }}>
                  {assessmentLabel}
                </span>
                {assessment.betterMove ? (
                  <span className="ml-auto chip">
                    {t('analysis.better')}: <span className="font-mono text-white">{assessment.betterMove}</span>
                  </span>
                ) : null}
              </div>

              <p className="px-3 py-2.5 text-[0.82rem] leading-relaxed text-[var(--text-primary)]">
                {assessment.explanation}
              </p>

              {assessment.details.length > 0 ? (
                <ul className="space-y-1 border-t border-white/[0.06] px-3 py-2">
                  {assessment.details.map((detail, index) => (
                    <li key={index} className="flex gap-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                      <span className="mt-[0.35rem] h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                      <span className="font-mono">{detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </motion.div>
          ) : null}

        {/* ---- Engine candidate moves ---- */}
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
            <span className="panel-title">{t('analysis.candidates')}</span>
            {source && analysis.lines.length > 0 ? (
              <span className="chip" title={t(`analysis.${source}Hint`)}>
                {source === 'tablebase' ? '📖 ' : source === 'cloud' ? '☁ ' : '⚙ '}
                {t(`analysis.${source}`)}
                {analysis.depth ? ` · d${analysis.depth}` : ''}
              </span>
            ) : null}
          </div>
          <EngineLines
            lines={analysis.lines}
            turn={turn}
            thinking={thinking}
            depth={engineDepth}
            onPlayMove={onPlayMove}
            solved={source === 'tablebase'}
          />
        </div>

        {/* ---- Full-game report ---- */}
        {review ? (
          <>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-1.5">
              <span className="stat-label">{t('review.mistakes', { n: mistakeIndices.length })}</span>
              <div className="flex gap-1.5">
                <Button onClick={() => gotoMistake(-1)} disabled={mistakeIndices.length === 0}>
                  {t('review.prevMistake')}
                </Button>
                <Button onClick={() => gotoMistake(1)} disabled={mistakeIndices.length === 0}>
                  {t('review.nextMistake')}
                </Button>
              </div>
            </div>
            <GameReviewSummary review={review} cursor={line.cursor} onSelect={navigate} />
          </>
        ) : null}
      </div>
    </div>
  );
}
