import { StockfishEngine } from './StockfishEngine';

/**
 * The app runs at most two engine instances:
 *
 *  - `live`   — follows the board cursor and is interrupted constantly.
 *  - `review` — created on demand for a full-game pass so the live evaluation
 *               keeps working while the review grinds through the game.
 */

let livePromise: Promise<StockfishEngine> | null = null;
let liveInstance: StockfishEngine | null = null;

export function getLiveEngine(hashMb = 32): Promise<StockfishEngine> {
  if (!livePromise) {
    livePromise = StockfishEngine.create(hashMb)
      .then((engine) => {
        liveInstance = engine;
        return engine;
      })
      .catch((err) => {
        // Allow a later retry rather than caching the failure forever.
        livePromise = null;
        throw err;
      });
  }
  return livePromise;
}

export function peekLiveEngine(): StockfishEngine | null {
  return liveInstance;
}

export function disposeLiveEngine(): void {
  liveInstance?.dispose();
  liveInstance = null;
  livePromise = null;
}

/** A throwaway engine for batch work. The caller owns it and must dispose it. */
export function createReviewEngine(hashMb = 64): Promise<StockfishEngine> {
  return StockfishEngine.create(hashMb);
}

/**
 * A persistent engine that plays the opponent's moves in the play-vs-engine mode. Kept
 * separate from the live-analysis engine so a game in progress never fights the board's
 * evaluation for the worker.
 */
let playPromise: Promise<StockfishEngine> | null = null;
let playInstance: StockfishEngine | null = null;

export function getPlayEngine(hashMb = 32): Promise<StockfishEngine> {
  if (!playPromise) {
    playPromise = StockfishEngine.create(hashMb)
      .then((engine) => {
        playInstance = engine;
        return engine;
      })
      .catch((err) => {
        playPromise = null;
        throw err;
      });
  }
  return playPromise;
}

export function disposePlayEngine(): void {
  playInstance?.dispose();
  playInstance = null;
  playPromise = null;
}
