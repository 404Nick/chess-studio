'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExplorerStats, OpeningEntry } from '@/types';
import { getExplorer } from '@/lib/api/client';
import { findOpening } from '@/lib/openings';

export interface OpeningInfo {
  /** Best local-book match for the moves played so far. */
  readonly entry: OpeningEntry | null;
  /** Half-moves covered by the book line. */
  readonly bookPlies: number;
  readonly stats: ExplorerStats | null;
  readonly loading: boolean;
  readonly error: string | null;
}

/**
 * Combines the bundled opening book (instant, offline) with the Lichess Opening
 * Explorer (complete coverage plus win statistics).
 */
export function useOpening(
  sanMoves: readonly string[],
  fen: string,
  db: 'lichess' | 'masters',
  enabled = true,
): OpeningInfo {
  const key = sanMoves.join(' ');
  const match = findOpening(sanMoves);

  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setError(null);
      return undefined;
    }

    const id = requestRef.current + 1;
    requestRef.current = id;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      getExplorer(fen, db, controller.signal)
        .then((result) => {
          if (requestRef.current !== id) return;
          setStats(result);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (requestRef.current !== id) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setStats(null);
          setError(err instanceof Error ? err.message : 'Could not reach the opening explorer.');
          setLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` is included so the effect also reruns when the move list changes shape
    // even if the FEN happens to repeat (transpositions).
  }, [fen, db, enabled, key]);

  return {
    entry: match?.entry ?? null,
    bookPlies: match?.plies ?? 0,
    stats,
    loading,
    error,
  };
}
