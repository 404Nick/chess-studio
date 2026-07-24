'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineStatus, PositionAnalysis } from '@/types';
import { emptyAnalysis } from '@/lib/engine/StockfishEngine';
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
  /** Delay before a position change starts a new search, in ms. */
  readonly debounceMs?: number;
}

export interface LiveAnalysis {
  readonly analysis: PositionAnalysis;
  readonly thinking: boolean;
}

/**
 * Keeps a running evaluation of `fen`. Position changes cancel the in-flight search,
 * and out-of-order results are discarded via a monotonically increasing token.
 */
export function useLiveAnalysis(fen: string, options: LiveAnalysisOptions): LiveAnalysis {
  const { enabled, depth, multiPv, debounceMs = 140 } = options;
  const [analysis, setAnalysis] = useState<PositionAnalysis>(() => emptyAnalysis(fen));
  const [thinking, setThinking] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setAnalysis(emptyAnalysis(fen));
      setThinking(false);
      return undefined;
    }

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setAnalysis(emptyAnalysis(fen));

    let cancelled = false;
    // A deep search emits many `info` lines per second. Committing each one to React
    // state can flood the render loop (and, during hydration, trip React's nested-update
    // ceiling). Throttle intermediate updates; the final result is always applied.
    let lastCommit = 0;
    const MIN_UPDATE_GAP_MS = 120;

    const timer = setTimeout(() => {
      if (cancelled) return;
      setThinking(true);

      getLiveEngine()
        .then((engine) =>
          engine.analyse({
            fen,
            depth,
            multiPv,
            onUpdate: (partial) => {
              if (cancelled || tokenRef.current !== token) return;
              const now = Date.now();
              if (now - lastCommit < MIN_UPDATE_GAP_MS) return;
              lastCommit = now;
              setAnalysis(partial);
            },
          }),
        )
        .then((final) => {
          if (!cancelled && tokenRef.current === token) {
            setAnalysis(final);
            setThinking(false);
          }
        })
        .catch(() => {
          if (!cancelled && tokenRef.current === token) setThinking(false);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Bump the token so any late result from the previous position is ignored.
      tokenRef.current += 1;
    };
  }, [fen, enabled, depth, multiPv, debounceMs]);

  useEffect(
    () => () => {
      peekLiveEngine()?.cancelAll();
    },
    [],
  );

  return { analysis, thinking };
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
