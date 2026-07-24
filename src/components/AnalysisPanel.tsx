'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback } from 'react';
import type { Color, PositionAnalysis } from '@/types';
import { MOVE_CLASS_META } from '@/lib/analysis/classify';
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
}: {
  analysis: PositionAnalysis;
  thinking: boolean;
  turn: Color;
  onPlayMove(uci: string): void;
  engineUnavailable: boolean;
}) {
  const line = useGame((state) => state.line);
  const review = useGame((state) => state.review);
  const navigate = useGame((state) => state.navigate);
  const node = useGame(currentNode);

  const reviewDepth = useSettings((state) => state.reviewDepth);
  const engineDepth = useSettings((state) => state.engineDepth);

  const gameReview = useGameReview();
  const { t } = useTranslation();
  const assessmentLabel = useClassLabel(node?.assessment?.classification ?? 'good');

  const startReview = useCallback(() => {
    void gameReview.start(line, reviewDepth);
  }, [gameReview, line, reviewDepth]);

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

        {/* ---- Why this move? ---- */}
        <AnimatePresence mode="wait">
          {assessment && meta && node ? (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
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
        </AnimatePresence>

        {/* ---- Engine candidate moves ---- */}
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          <div className="border-b border-white/[0.06] px-3 py-1.5">
            <span className="panel-title">{t('analysis.candidates')}</span>
          </div>
          <EngineLines
            lines={analysis.lines}
            turn={turn}
            thinking={thinking}
            depth={engineDepth}
            onPlayMove={onPlayMove}
          />
        </div>

        {/* ---- Full-game report ---- */}
        {review ? <GameReviewSummary review={review} cursor={line.cursor} onSelect={navigate} /> : null}
      </div>
    </div>
  );
}
