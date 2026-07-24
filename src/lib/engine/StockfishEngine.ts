import type { Color, EngineLine, EngineStatus, PositionAnalysis, Score } from '@/types';
import { terminalScore, uciLineToSan } from '@/lib/chess/line';
import { fenTurn } from '@/lib/chess/fen';
import { type RawInfo, normaliseScore, parseBestMove, parseInfo, scoreToNumber } from './uci';

const ENGINE_DIR = '/stockfish';
const MANIFEST_URL = `${ENGINE_DIR}/manifest.json`;
const FALLBACK_ENTRIES = [
  'stockfish-nnue-16-single.js',
  'stockfish-nnue-16-no-simd.js',
  'stockfish.js',
];

// The NNUE engine loads a ~40 MB net at startup, so allow a generous handshake window.
const HANDSHAKE_TIMEOUT_MS = 45_000;
const SEARCH_HARD_TIMEOUT_MS = 120_000;

function isCrossOriginIsolated(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  );
}

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

export interface AnalyseRequest {
  readonly fen: string;
  readonly depth: number;
  readonly multiPv?: number;
  /** Hard cap for this search, in ms. 0/undefined means depth-bound only. */
  readonly moveTimeMs?: number;
  /** Streams intermediate results as the search deepens. */
  readonly onUpdate?: (analysis: PositionAnalysis) => void;
}

interface Job {
  readonly request: AnalyseRequest;
  readonly resolve: (analysis: PositionAnalysis) => void;
  readonly reject: (error: Error) => void;
  cancelled: boolean;
}

type StatusListener = (status: EngineStatus, detail?: string) => void;

async function resolveEntryUrl(): Promise<string> {
  const isolated = isCrossOriginIsolated();
  try {
    // `no-store`: the manifest is the mutable index into the (immutable) engine files,
    // so it must never be served from a stale HTTP cache after an engine upgrade.
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (response.ok) {
      const manifest = (await response.json()) as {
        entry?: string;
        single?: string;
        threaded?: string | null;
      };
      // Use the multi-threaded build only when SharedArrayBuffer is actually available.
      const chosen = (isolated && manifest.threaded) || manifest.single || manifest.entry;
      if (chosen) return `${ENGINE_DIR}/${chosen}`;
    }
  } catch {
    // Manifest is optional — fall through to probing well-known filenames.
  }

  for (const name of FALLBACK_ENTRIES) {
    try {
      const head = await fetch(`${ENGINE_DIR}/${name}`, { method: 'HEAD' });
      if (head.ok) return `${ENGINE_DIR}/${name}`;
    } catch {
      // try next
    }
  }

  throw new EngineUnavailableError(
    'No Stockfish build found in /public/stockfish. Run `npm install` (or `node scripts/setup-engine.mjs`) to copy the engine.',
  );
}

/**
 * A single Stockfish worker with a serialised job queue.
 *
 * Every `analyse()` call is queued; starting a new search while one is running sends
 * `stop` to the engine so the in-flight search resolves with its best result so far.
 */
export class StockfishEngine {
  private worker: Worker | null = null;

  private status: EngineStatus = 'idle';

  private statusDetail: string | undefined;

  private readonly listeners = new Set<StatusListener>();

  private queue: Job[] = [];

  private activeJob: Job | null = null;

  private infos = new Map<number, RawInfo>();

  private bestMove: string | null = null;

  private currentMultiPv = 1;

  private supportsThreads = false;

  private optionNames = new Set<string>();

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private readonly hashMb: number) {}

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  static async create(hashMb = 32): Promise<StockfishEngine> {
    const engine = new StockfishEngine(hashMb);
    await engine.boot();
    return engine;
  }

  private setStatus(status: EngineStatus, detail?: string): void {
    this.status = status;
    this.statusDetail = detail;
    this.listeners.forEach((listener) => listener(status, detail));
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getStatusDetail(): string | undefined {
    return this.statusDetail;
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.statusDetail);
    return () => this.listeners.delete(listener);
  }

  private async boot(): Promise<void> {
    this.setStatus('loading');

    if (typeof Worker === 'undefined') {
      this.setStatus('unavailable', 'Web Workers are not available in this environment.');
      throw new EngineUnavailableError('Web Workers are not available.');
    }

    const url = await resolveEntryUrl();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new EngineUnavailableError('Stockfish did not respond to the UCI handshake in time.'));
      }, HANDSHAKE_TIMEOUT_MS);

      let worker: Worker;
      try {
        worker = new Worker(url);
      } catch (err) {
        clearTimeout(timer);
        reject(
          new EngineUnavailableError(
            `Could not start the engine worker: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }

      this.worker = worker;

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new EngineUnavailableError(event.message || 'The Stockfish worker failed to load.'));
      };

      worker.onmessage = (event: MessageEvent) => {
        const text = typeof event.data === 'string' ? event.data : String((event.data as { data?: unknown })?.data ?? '');
        if (!text) return;

        if (text.startsWith('option name ')) {
          const name = text.slice('option name '.length).split(' type ')[0];
          this.optionNames.add(name);
          if (name === 'Threads') this.supportsThreads = true;
          return;
        }

        if (text === 'uciok') {
          this.configure();
          this.send('isready');
          return;
        }

        if (text === 'readyok') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            // Swap to the steady-state message handler and go.
            worker.onmessage = (e: MessageEvent) => this.handleMessage(e);
            worker.onerror = (e: ErrorEvent) => this.handleFatal(e.message);
            this.send('ucinewgame');
            this.setStatus('ready');
            resolve();
          }
          return;
        }
      };

      this.send('uci');
    });
  }

  private configure(): void {
    this.setOption('Hash', String(this.hashMb));
    this.setOption('Ponder', 'false');
    this.setOption('UCI_AnalyseMode', 'true');

    // Only enable threads when the build supports them *and* the page is cross-origin
    // isolated (SharedArrayBuffer). Otherwise a threaded build silently stalls. Uses most
    // of the machine's cores for a big speed-up on the multi-threaded NNUE build.
    if (this.supportsThreads && isCrossOriginIsolated()) {
      const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
      const threads = Math.max(1, Math.min(8, cores - 1));
      this.setOption('Threads', String(threads));
    }
  }

  private setOption(name: string, value: string): void {
    // Sending an unsupported option is harmless, but skip it when we know the list.
    if (this.optionNames.size > 0 && !this.optionNames.has(name)) return;
    this.send(`setoption name ${name} value ${value}`);
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private handleFatal(message: string): void {
    this.setStatus('error', message);
    const failure = new Error(message);
    this.activeJob?.reject(failure);
    this.activeJob = null;
    this.queue.splice(0).forEach((job) => job.reject(failure));
  }

  dispose(): void {
    this.clearSearchTimer();
    this.queue.splice(0).forEach((job) => {
      job.cancelled = true;
      job.reject(new Error('Engine disposed.'));
    });
    if (this.activeJob) {
      this.activeJob.reject(new Error('Engine disposed.'));
      this.activeJob = null;
    }
    try {
      this.send('quit');
    } catch {
      // ignore
    }
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    this.setStatus('idle');
  }

  /* ---------------------------------------------------------------- */
  /* Searching                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Queues an analysis. Any search already running is stopped so the new request
   * starts as soon as possible.
   */
  analyse(request: AnalyseRequest): Promise<PositionAnalysis> {
    if (!this.worker) {
      return Promise.reject(new EngineUnavailableError('Engine is not running.'));
    }

    return new Promise<PositionAnalysis>((resolve, reject) => {
      const job: Job = { request, resolve, reject, cancelled: false };
      this.queue.push(job);
      if (this.activeJob) this.send('stop');
      else this.runNext();
    });
  }

  /** Drops everything that has not started yet and stops the running search. */
  cancelAll(): void {
    this.queue.splice(0).forEach((job) => {
      job.cancelled = true;
      job.resolve(emptyAnalysis(job.request.fen, job.request.depth));
    });
    if (this.activeJob) this.send('stop');
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Force-completes the active job when the engine has gone silent. Resolves with
   * whatever partial lines arrived so the queue keeps moving instead of wedging.
   */
  private forceFinish(): void {
    if (!this.activeJob) return;
    this.bestMove = this.bestMove ?? null;
    this.finishJob();
  }

  private runNext(): void {
    if (this.activeJob || this.queue.length === 0 || !this.worker) return;

    const job = this.queue.shift()!;
    if (job.cancelled) {
      this.runNext();
      return;
    }

    // Terminal positions (checkmate / stalemate) hang the bundled engine — it never
    // returns `bestmove`, which would wedge every later search. Resolve them directly
    // and move on without touching the worker.
    const terminal = terminalScore(job.request.fen);
    if (terminal) {
      const analysis: PositionAnalysis = {
        fen: job.request.fen,
        depth: 0,
        lines: [
          {
            multipv: 1,
            score: terminal.score,
            depth: 0,
            seldepth: 0,
            pv: [],
            san: [],
            nodes: 0,
            nps: 0,
            timeMs: 0,
          },
        ],
        bestMove: null,
        partial: false,
      };
      job.resolve(job.cancelled ? emptyAnalysis(job.request.fen, job.request.depth) : analysis);
      this.setStatus(this.queue.length > 0 ? 'searching' : 'ready');
      this.runNext();
      return;
    }

    this.activeJob = job;
    this.infos.clear();
    this.bestMove = null;

    const multiPv = Math.max(1, Math.min(5, job.request.multiPv ?? 1));
    if (multiPv !== this.currentMultiPv) {
      this.currentMultiPv = multiPv;
      this.setOption('MultiPV', String(multiPv));
    }

    this.setStatus('searching');
    // NB: no `ucinewgame` here on purpose — keeping the transposition table warm
    // makes a full-game review several times faster.
    this.send(`position fen ${job.request.fen}`);

    const goParts = ['go', `depth ${Math.max(1, Math.min(40, job.request.depth))}`];
    if (job.request.moveTimeMs && job.request.moveTimeMs > 0) {
      goParts.push(`movetime ${Math.trunc(job.request.moveTimeMs)}`);
    }
    this.send(goParts.join(' '));

    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      // Ask the engine to stop; if it stays silent it is wedged — force the job to
      // resolve a few seconds later so later searches are not blocked forever.
      this.send('stop');
      this.watchdogTimer = setTimeout(() => this.forceFinish(), 4000);
    }, SEARCH_HARD_TIMEOUT_MS);
  }

  private handleMessage(event: MessageEvent): void {
    const text = typeof event.data === 'string' ? event.data : String((event.data as { data?: unknown })?.data ?? '');
    if (!text || !this.activeJob) return;

    const info = parseInfo(text);
    if (info) {
      if (info.bound) return;
      const existing = this.infos.get(info.multipv);
      if (!existing || info.depth >= existing.depth) {
        this.infos.set(info.multipv, info);
        this.emitPartial();
      }
      return;
    }

    const best = parseBestMove(text);
    if (text.startsWith('bestmove')) {
      this.bestMove = best;
      this.finishJob();
    }
  }

  private emitPartial(): void {
    const job = this.activeJob;
    if (!job?.request.onUpdate) return;
    job.request.onUpdate(this.buildAnalysis(job.request, true));
  }

  private finishJob(): void {
    const job = this.activeJob;
    this.activeJob = null;
    this.clearSearchTimer();

    if (job) {
      const analysis = this.buildAnalysis(job.request, false);
      if (job.cancelled) job.resolve(emptyAnalysis(job.request.fen, job.request.depth));
      else job.resolve(analysis);
    }

    this.setStatus(this.queue.length > 0 ? 'searching' : 'ready');
    this.runNext();
  }

  private buildAnalysis(request: AnalyseRequest, partial: boolean): PositionAnalysis {
    const turn: Color = fenTurn(request.fen);

    const lines: EngineLine[] = [...this.infos.values()]
      .map((info) => {
        const score: Score = normaliseScore(info.score, turn);
        return {
          multipv: info.multipv,
          score,
          depth: info.depth,
          seldepth: info.seldepth,
          pv: info.pv,
          san: uciLineToSan(request.fen, info.pv.slice(0, 12)),
          nodes: info.nodes,
          nps: info.nps,
          timeMs: info.timeMs,
        } satisfies EngineLine;
      })
      // Best first from the mover's perspective.
      .sort((a, b) => {
        const av = turn === 'w' ? scoreToNumber(a.score) : -scoreToNumber(a.score);
        const bv = turn === 'w' ? scoreToNumber(b.score) : -scoreToNumber(b.score);
        return bv - av;
      });

    const depth = lines.reduce((max, line) => Math.max(max, line.depth), 0);

    return {
      fen: request.fen,
      depth,
      lines,
      bestMove: this.bestMove ?? lines[0]?.pv[0] ?? null,
      partial,
    };
  }
}

export function emptyAnalysis(fen: string, depth = 0): PositionAnalysis {
  return { fen, depth, lines: [], bestMove: null, partial: false };
}
