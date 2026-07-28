'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameRecord } from '@/lib/games/gamesDb';
import { ReviewCancelledError, reviewGame } from '@/lib/analysis/review';
import { parsePgn } from '@/lib/chess/line';
import { getLiveEngine, peekLiveEngine } from '@/lib/engine/engineManager';
import { getCachedReview, markReviewed, putReview } from '@/lib/games/gamesDb';
import { bookPlyCount, findOpening } from '@/lib/openings';
import { useSettings } from '@/store/settingsStore';

export interface BatchReviewHandle {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
  readonly error: string | null;
  /** Reviews each game that has not been reviewed yet, caching every result. */
  start(records: readonly GameRecord[], depth: number): Promise<void>;
  cancel(): void;
}

/**
 * Reviews a batch of stored games on one shared engine (kept warm across games), caching
 * each review and stamping the game record with its accuracy. Feeds the stats dashboard
 * and the tactics trainer.
 */
export function useBatchReview(): BatchReviewHandle {
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
    async (records: readonly GameRecord[], depth: number) => {
      if (activeRef.current || records.length === 0) return;
      activeRef.current = true;
      cancelRef.current = false;
      setError(null);
      setRunning(true);
      setDone(0);
      setTotal(records.length);

      try {
        // Reuse the shared live engine (already booted by the header) rather than
        // spawning a second worker — two cold NNUE boots at once can blow the handshake
        // timeout, and the library has no live board competing for it.
        const engine = await getLiveEngine();

        for (let i = 0; i < records.length; i += 1) {
          if (cancelRef.current) break;
          const record = records[i];

          const { line } = parsePgn(record.pgn);
          if (line.moves.length > 0) {
            // Reuse a cached review when one already exists, else compute it.
            const cached = await getCachedReview(line);
            let review = cached?.review ?? null;

            if (!review) {
              const sanMoves = line.moves.map((move) => move.san);
              const match = findOpening(sanMoves);
              const result = await reviewGame(engine, line, {
                depth,
                multiPv: 2,
                bookPlies: bookPlyCount(sanMoves),
                openingName: match?.entry.name ?? null,
                lang,
                shouldCancel: () => cancelRef.current,
              });
              await putReview(result.line, result.review);
              review = result.review;
            }

            if (review) await markReviewed(record.id, review);
          }

          setDone(i + 1);
        }
      } catch (err) {
        if (!(err instanceof ReviewCancelledError)) {
          setError(err instanceof Error ? err.message : 'The batch review could not be completed.');
        }
      } finally {
        // The live engine is shared — don't dispose it, just stop any pending search.
        peekLiveEngine()?.cancelAll();
        activeRef.current = false;
        setRunning(false);
      }
    },
    [lang],
  );

  return { running, done, total, error, start, cancel };
}
