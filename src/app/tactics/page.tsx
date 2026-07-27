'use client';

import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardShape, Square } from '@/types';
import { fenTurn } from '@/lib/chess/fen';
import { getAllReviews } from '@/lib/games/gamesDb';
import { type Tactic, extractTactics, shuffle } from '@/lib/games/tactics';
import { getTheme, SHAPE_COLORS } from '@/lib/theme/boardThemes';
import { playSound } from '@/lib/sound/sounds';
import { useTranslation } from '@/lib/i18n';
import { useSettings } from '@/store/settingsStore';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { Button, EmptyState, Panel, PanelHeader, Spinner } from '@/components/ui/Primitives';

type Status = 'solving' | 'solved' | 'revealed';

export default function TacticsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);

  const [tactics, setTactics] = useState<Tactic[] | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('solving');
  const [feedback, setFeedback] = useState<'wrong' | null>(null);
  const [afterFen, setAfterFen] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [wrongThisPuzzle, setWrongThisPuzzle] = useState(false);
  const [stats, setStats] = useState({ solved: 0, failed: 0, streak: 0 });

  useEffect(() => {
    let cancelled = false;
    getAllReviews()
      .then((reviews) => {
        if (cancelled) return;
        setTactics(shuffle(extractTactics(reviews)));
      })
      .catch(() => {
        if (!cancelled) setTactics([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = tactics && tactics.length > 0 ? tactics[index % tactics.length] : null;

  const nextPuzzle = useCallback(() => {
    setStatus('solving');
    setFeedback(null);
    setAfterFen(null);
    setHint(false);
    setWrongThisPuzzle(false);
    setIndex((i) => i + 1);
  }, []);

  const reveal = useCallback(() => {
    if (!current || status !== 'solving') return;
    setStatus('revealed');
    setStats((s) => ({ ...s, failed: s.failed + 1, streak: 0 }));
  }, [current, status]);

  const onMove = useCallback(
    (move: BoardMove): boolean => {
      if (!current || status !== 'solving') return false;
      const chess = new Chess(current.fen);
      let played;
      try {
        played = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      } catch {
        return false;
      }
      if (!played) return false;

      const uci = `${played.from}${played.to}${played.promotion ?? ''}`;
      if (uci === current.solutionUci) {
        setAfterFen(chess.fen());
        setStatus('solved');
        setFeedback(null);
        setStats((s) => ({
          solved: s.solved + 1,
          failed: s.failed,
          streak: wrongThisPuzzle ? s.streak : s.streak + 1,
        }));
        if (settings.soundEnabled) playSound('promote', settings.soundVolume);
        return true;
      }

      // A legal but sub-par move — let them try again.
      setFeedback('wrong');
      setWrongThisPuzzle(true);
      setStats((s) => ({ ...s, streak: 0 }));
      if (settings.soundEnabled) playSound('blunder', settings.soundVolume);
      return false;
    },
    [current, status, wrongThisPuzzle, settings.soundEnabled, settings.soundVolume],
  );

  if (tactics === null) {
    return (
      <Panel className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </Panel>
    );
  }

  if (!current) {
    return (
      <Panel className="min-h-[60vh]">
        <EmptyState title={t('tactics.emptyTitle')} body={t('tactics.emptyBody')} icon="🎯" />
      </Panel>
    );
  }

  const orientation = current.side === 'w' ? 'white' : 'black';
  const displayFen = status === 'solved' && afterFen ? afterFen : current.fen;
  const showArrow = status === 'revealed';
  const hintShapes: BoardShape[] = hint
    ? [{ from: current.solutionUci.slice(0, 2) as Square, to: current.solutionUci.slice(0, 2) as Square, kind: 'highlight', color: SHAPE_COLORS[3].value }]
    : [];

  const total = tactics.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            {fenTurn(current.fen) === 'w' ? t('board.whiteToMove') : t('board.blackToMove')}
          </p>
          <span className="chip">{`${(index % total) + 1} / ${total}`}</span>
        </div>
        <BoardSurface
          fen={displayFen}
          orientation={orientation}
          theme={theme}
          pieceStyle={settings.pieceStyle}
          onMove={onMove}
          lastMove={null}
          shapes={hintShapes}
          bestMove={showArrow ? current.solutionUci : null}
          showCoordinates={settings.showCoordinates}
          showLegalMoves={settings.showLegalMoves}
          animationMs={settings.animationMs}
          interactive={status === 'solving'}
        />
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel className="p-3">
          <PanelHeader title={t('tactics.title')} subtitle={t('tactics.subtitle')} />

          <div className="mt-3 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t('tactics.prompt')}</p>

            {feedback === 'wrong' ? (
              <div className="rounded-lg bg-[rgba(229,72,77,0.14)] px-3 py-2 text-sm font-semibold text-[#ffb4b6]">
                {t('tactics.tryAgain')}
              </div>
            ) : null}

            {status === 'solved' ? (
              <div className="rounded-lg bg-[rgba(127,206,107,0.14)] px-3 py-2 text-sm font-semibold text-[#7fce6b]">
                {t('tactics.solved', { move: current.solutionSan })}
              </div>
            ) : null}

            {status === 'revealed' ? (
              <div className="rounded-lg bg-black/25 px-3 py-2 text-sm text-[var(--text-secondary)]">
                {t('tactics.answer', { move: current.solutionSan })}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {status === 'solving' ? (
                <>
                  <Button onClick={() => setHint(true)} disabled={hint}>
                    {t('tactics.hint')}
                  </Button>
                  <Button onClick={reveal}>{t('tactics.reveal')}</Button>
                </>
              ) : (
                <Button variant="primary" className="flex-1" onClick={nextPuzzle}>
                  {t('tactics.next')}
                </Button>
              )}
            </div>

            <p className="text-[0.68rem] text-[var(--text-muted)]">
              {t('tactics.origin', { klass: t(`class.${current.classification}`), move: current.playedSan })}
            </p>
          </div>
        </Panel>

        <Panel className="p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="font-mono text-lg font-bold text-[#7fce6b]">{stats.solved}</p>
              <p className="stat-label">{t('tactics.solvedCount')}</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="font-mono text-lg font-bold text-[#e5484d]">{stats.failed}</p>
              <p className="stat-label">{t('tactics.failedCount')}</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-2">
              <p className="font-mono text-lg font-bold text-white">{stats.streak}</p>
              <p className="stat-label">{t('tactics.streak')}</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
