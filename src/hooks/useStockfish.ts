'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineStatus, PositionAnalysis } from '@/types';
import { emptyAnalysis } from '@/lib/engine/StockfishEngine';
import { fetchCloudEval } from '@/lib/engine/cloudEval';
import { fetchTablebase, pieceCount } from '@/lib/engine/tablebase';
import { disposeLiveEngine, getLiveEngine, peekLiveEngine } from '@/lib/engine/engineManager';

export interface EngineHandle {
  readonly status: EngineStatus;
  readonly error: string | null;
  readonly ready: boolean;
  retry(): void;
}

/** Boots the shared live engine and tracks its status. */
export function useEngine(hashMb = 32): EngineHandle {
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setStatus('loading');
    setError(null);

    getLiveEngine(hashMb)
      .then((engine) => {
        if (cancelled) return;
        unsubscribe = engine.onStatus((next, detail) => {
          setStatus(next);
          if (next === 'error' && detail) setError(detail);
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('unavailable');
        setError(err instanceof Error ? err.message : 'The engine could not be started.');
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hashMb, attempt]);

  const retry = useCallback(() => {
    disposeLiveEngine();
    setAttempt((value) => value + 1);
  }, []);

  return {
    status,
    error,
    ready: status === 'ready' || status === 'searching',
    retry,
  };
}

export interface LiveAnalysisOptions {
  readonly enabled: boolean;
  readonly depth: number;
  readonly multiPv: number;
  /** Try Lichess' cloud evaluation cache before spinning up the local engine. */
  readonly cloudEval?: boolean;
  /** Try the Lichess tablebase first for ≤7-piece endgames. */
  readonly tablebase?: boolean;
  /** Delay before a position change starts a new search, in ms. */
  readonly debounceMs?: number;
}

/** Where the current evaluation came from. */
export type AnalysisSource = 'tablebase' | 'cloud' | 'local' | null;

export interface LiveAnalysis {
  readonly analysis: PositionAnalysis;
  readonly thinking: boolean;
  readonly source: AnalysisSource;
}

/**
 * Keeps a running evaluation of `fen`. Position changes cancel the in-flight search,
 * and out-of-order results are discarded via a monotonically increasing token.
 *
 * When `cloudEval` is on, Lichess' cloud cache is queried first: a hit is displayed
 * instantly (typically far deeper than a local search) and skips the engine entirely;
 * a miss falls back seamlessly to the local Stockfish worker.
 */
export function useLiveAnalysis(fen: string, options: LiveAnalysisOptions): LiveAnalysis {
  const { enabled, depth, multiPv, cloudEval = false, tablebase = false, debounceMs = 140 } = options;
  const [analysis, setAnalysis] = useState<PositionAnalysis>(() => emptyAnalysis(fen));
  const [thinking, setThinking] = useState(false);
  const [source, setSource] = useState<AnalysisSource>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setAnalysis(emptyAnalysis(fen));
      setThinking(false);
      setSource(null);
      return undefined;
    }

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setAnalysis(emptyAnalysis(fen));
    setSource(null);

    let cancelled = false;
    const cloudAbort = new AbortController();
    // A deep search emits many `info` lines per second. Committing each one to React
    // state can flood the render loop (and, during hydration, trip React's nested-update
    // ceiling). Throttle intermediate updates; the final result is always applied.
    let lastCommit = 0;
    const MIN_UPDATE_GAP_MS = 120;

    const stale = () => cancelled || tokenRef.current !== token;

    const runLocal = () => {
      if (stale()) return;
      setThinking(true);
      getLiveEngine()
        .then((engine) =>
          engine.analyse({
            fen,
            depth,
            multiPv,
            onUpdate: (partial) => {
              if (stale()) return;
              const now = Date.now();
              if (now - lastCommit < MIN_UPDATE_GAP_MS) return;
              lastCommit = now;
              setSource('local');
              setAnalysis(partial);
            },
          }),
        )
        .then((final) => {
          if (stale()) return;
          setSource('local');
          setAnalysis(final);
          setThinking(false);
        })
        .catch(() => {
          if (!stale()) setThinking(false);
        });
    };

    // Cloud cache → local engine.
    const tryCloud = () => {
      if (!cloudEval) {
        runLocal();
        return;
      }
      fetchCloudEval(fen, multiPv, cloudAbort.signal)
        .then((cloud) => {
          if (stale()) return;
          if (cloud) {
            setSource('cloud');
            setAnalysis(cloud);
            setThinking(false);
            return;
          }
          runLocal();
        })
        .catch(() => {
          if (!stale()) runLocal();
        });
    };

    const timer = setTimeout(() => {
      if (stale()) return;
      setThinking(true);

      // Exact endgame tablebase first for ≤7-piece positions, then cloud, then local.
      if (tablebase && pieceCount(fen) <= 7) {
        fetchTablebase(fen, multiPv, cloudAbort.signal)
          .then((tb) => {
            if (stale()) return;
            if (tb) {
              setSource('tablebase');
              setAnalysis(tb);
              setThinking(false);
              return;
            }
            tryCloud();
          })
          .catch(() => {
            if (!stale()) tryCloud();
          });
        return;
      }

      tryCloud();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cloudAbort.abort();
      // Bump the token so any late result from the previous position is ignored.
      tokenRef.current += 1;
    };
  }, [fen, enabled, depth, multiPv, cloudEval, tablebase, debounceMs]);

  useEffect(
    () => () => {
      peekLiveEngine()?.cancelAll();
    },
    [],
  );

  return { analysis, thinking, source };
}

/**
 * One-shot analysis, used when a move is played and we need the "before" and "after"
 * evaluations to classify it.
 */
export function useAnalyseOnce(): (fen: string, depth: number, multiPv: number) => Promise<PositionAnalysis> {
  return useCallback(async (fen: string, depth: number, multiPv: number) => {
    const engine = await getLiveEngine();
    return engine.analyse({ fen, depth, multiPv });
  }, []);
}
