'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Line } from '@/types';
import { ReviewCancelledError, reviewGame } from '@/lib/analysis/review';
import { createReviewEngine } from '@/lib/engine/engineManager';
import { bookPlyCount, findOpening } from '@/lib/openings';
import { useGame } from '@/store/gameStore';
import { useSettings } from '@/store/settingsStore';

export interface GameReviewHandle {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
  readonly error: string | null;
  start(line: Line, depth: number): Promise<void>;
  cancel(): void;
}

/**
 * Runs a full-game review on a dedicated engine instance so the live evaluation on
 * the board keeps responding while the review works through the game.
 */
export function useGameReview(): GameReviewHandle {
  const applyReview = useGame((state) => state.applyReview);
  const setReviewProgress = useGame((state) => state.setReviewProgress);
  const lang = useSettings((state) => state.language);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const activeRef = useRef(false);

  useEffect(
    () => () => {
      cancelRef.current = true;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const start = useCallback(
    async (line: Line, depth: number) => {
      if (activeRef.current || line.moves.length === 0) return;

      activeRef.current = true;
      cancelRef.current = false;
      setError(null);
      setRunning(true);
      setDone(0);
      setTotal(line.moves.length + 1);
      setReviewProgress({ done: 0, total: line.moves.length + 1, running: true });

      const sanMoves = line.moves.map((move) => move.san);
      const match = findOpening(sanMoves);

      let engine = null as Awaited<ReturnType<typeof createReviewEngine>> | null;

      try {
        engine = await createReviewEngine(64);
        const result = await reviewGame(engine, line, {
          depth,
          multiPv: 2,
          bookPlies: bookPlyCount(sanMoves),
          openingName: match?.entry.name ?? null,
          lang,
          onProgress: (completed, count) => {
            setDone(completed);
            setTotal(count);
            setReviewProgress({ done: completed, total: count, running: true });
          },
          shouldCancel: () => cancelRef.current,
        });
        applyReview(result.line, result.review);
      } catch (err) {
        if (!(err instanceof ReviewCancelledError)) {
          setError(err instanceof Error ? err.message : 'The review could not be completed.');
        }
        setReviewProgress({ done: 0, total: 0, running: false });
      } finally {
        engine?.dispose();
        activeRef.current = false;
        setRunning(false);
      }
    },
    [applyReview, setReviewProgress, lang],
  );

  return { running, done, total, error, start, cancel };
}
