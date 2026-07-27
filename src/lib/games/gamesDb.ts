'use client';

import type { GameHeaders, GameReview, Line, Platform, RemoteGame } from '@/types';
import { parsePgn } from '@/lib/chess/line';
import { findOpening } from '@/lib/openings';

/**
 * A local, offline game database backed directly by IndexedDB.
 *
 * A hand-rolled promise wrapper (rather than idb/Dexie) keeps the app dependency-free
 * and fully self-contained — the same philosophy as the bundled engine and the drawn
 * piece sets. The store holds a normalised list of every position each game reached, so
 * an exact-FEN "which of my games featured this position?" search is a single indexed
 * lookup instead of a full scan.
 */

const DB_NAME = 'chess-studio';
const DB_VERSION = 2;
const STORE = 'games';
const REVIEW_STORE = 'reviews';

export type GameOrigin = Platform | 'local';

export interface GameRecord {
  /** Stable content-derived id, so re-importing the same game overwrites it. */
  id: string;
  addedAt: number;
  /** Epoch ms the game was played (0 when unknown). */
  playedAt: number;
  white: string;
  black: string;
  whiteLower: string;
  blackLower: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  eco: string | null;
  opening: string | null;
  openingLower: string;
  event: string | null;
  site: string | null;
  date: string | null;
  timeControl: string | null;
  origin: GameOrigin;
  url: string | null;
  /** Number of half-moves. */
  ply: number;
  pgn: string;
  /** Normalised FEN of every position reached (piece placement + turn + castling + ep). */
  positions: string[];
}

export interface GameFilter {
  /** Substring match on either player name or the opening. */
  text?: string;
  /** ECO prefix, e.g. "B" (all Sicilians) or "B90". */
  eco?: string;
  /** '1-0' | '0-1' | '1/2-1/2' */
  result?: string;
  origin?: GameOrigin;
  /** Inclusive epoch-ms bounds on `playedAt`. */
  dateFrom?: number;
  dateTo?: number;
  /** Any FEN reached during the game (exact position match, clocks ignored). */
  fen?: string;
}

/* ------------------------------------------------------------------ */
/* Low-level IndexedDB plumbing                                        */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('playedAt', 'playedAt');
        store.createIndex('addedAt', 'addedAt');
        store.createIndex('eco', 'eco');
        store.createIndex('result', 'result');
        // multiEntry: one index entry per position, so an exact-FEN lookup is O(matches).
        store.createIndex('positions', 'positions', { multiEntry: true });
      }
      // v2: a cache of completed game reviews, keyed by the line's content hash.
      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        db.createObjectStore(REVIEW_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the game database.'));
  }).catch((err) => {
    // Let a later call retry rather than caching the failure forever.
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ------------------------------------------------------------------ */
/* Record construction                                                 */
/* ------------------------------------------------------------------ */

/** The position-identity portion of a FEN: placement, turn, castling, en passant. */
export function normaliseFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

function collectPositions(line: Line): string[] {
  const seen = new Set<string>();
  seen.add(normaliseFen(line.startFen));
  for (const move of line.moves) seen.add(normaliseFen(move.fenAfter));
  return [...seen];
}

/** Parses a "YYYY.MM.DD" / "YYYY-MM-DD" PGN date into epoch ms, or null. */
function parsePgnDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/-/g, '.').match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(ms) ? null : ms;
}

/** A small, stable hash so the same game imported twice keeps one id. */
function hashId(parts: string): string {
  let hash = 5381;
  for (let i = 0; i < parts.length; i += 1) hash = ((hash << 5) + hash + parts.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface BuildMeta {
  origin?: GameOrigin;
  id?: string;
  url?: string | null;
  playedAt?: number;
  whiteElo?: number | null;
  blackElo?: number | null;
}

/**
 * Builds a {@link GameRecord} from a single PGN game. Returns null when the PGN has no
 * playable moves. Missing ECO/opening are filled in from the offline opening book.
 */
export function buildRecord(pgn: string, meta: BuildMeta = {}): GameRecord | null {
  const { line, headers } = parsePgn(pgn);
  if (line.moves.length === 0) return null;

  const san = line.moves.map((move) => move.san);
  const match = findOpening(san);

  const white = headers.white ?? 'White';
  const black = headers.black ?? 'Black';
  const eco = headers.eco ?? match?.entry.eco ?? null;
  const opening = headers.opening ?? match?.entry.name ?? null;
  const playedAt = meta.playedAt ?? parsePgnDate(headers.date) ?? 0;

  const id =
    meta.id ??
    hashId([white, black, headers.date ?? '', headers.result ?? '', String(line.moves.length), san.join('')].join('|'));

  return {
    id,
    addedAt: Date.now(),
    playedAt,
    white,
    black,
    whiteLower: white.toLowerCase(),
    blackLower: black.toLowerCase(),
    whiteElo: meta.whiteElo ?? toNumber(headers.whiteElo),
    blackElo: meta.blackElo ?? toNumber(headers.blackElo),
    result: headers.result ?? '*',
    eco,
    opening,
    openingLower: (opening ?? '').toLowerCase(),
    event: headers.event ?? null,
    site: headers.site ?? null,
    date: headers.date ?? null,
    timeControl: headers.timeControl ?? null,
    origin: meta.origin ?? 'local',
    url: meta.url ?? headers.site ?? null,
    ply: line.moves.length,
    pgn,
    positions: collectPositions(line),
  };
}

/** Builds a record straight from a fetched Lichess/Chess.com game. */
export function recordFromRemote(game: RemoteGame): GameRecord | null {
  return buildRecord(game.pgn, {
    origin: game.platform,
    id: `${game.platform}:${game.id}`,
    url: game.url,
    playedAt: game.playedAt,
    whiteElo: game.whiteRating,
    blackElo: game.blackRating,
  });
}

/** Splits a PGN file that may contain several games into individual game strings. */
export function splitPgnGames(pgn: string): string[] {
  const trimmed = pgn.trim();
  if (!trimmed) return [];
  // Every game begins with an [Event ...] tag; split before each one but the first.
  return trimmed
    .split(/\n\s*(?=\[Event\s)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function putGame(record: GameRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Adds one game from PGN text. Returns the stored record, or null if it had no moves. */
export async function addGameFromPgn(pgn: string, meta?: BuildMeta): Promise<GameRecord | null> {
  const record = buildRecord(pgn, meta);
  if (!record) return null;
  await putGame(record);
  return record;
}

/** Bulk-imports every game in a (possibly multi-game) PGN. Returns how many were stored. */
export async function importPgnFile(pgn: string, meta?: BuildMeta): Promise<number> {
  const games = splitPgnGames(pgn);
  const records = games
    .map((game) => buildRecord(game, meta))
    .filter((record): record is GameRecord => record !== null);
  if (records.length === 0) return 0;

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const record of records) store.put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return records.length;
}

/** Stores several already-fetched remote games in one transaction. */
export async function addRemoteGames(games: readonly RemoteGame[]): Promise<number> {
  const records = games
    .map((game) => recordFromRemote(game))
    .filter((record): record is GameRecord => record !== null);
  if (records.length === 0) return 0;

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const record of records) store.put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return records.length;
}

/** Every stored game (used by the stats dashboard). */
export async function getAllGames(): Promise<GameRecord[]> {
  const db = await openDb();
  return toPromise(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<GameRecord[]>);
}

export async function getGame(id: string): Promise<GameRecord | undefined> {
  const db = await openDb();
  return toPromise(db.transaction(STORE).objectStore(STORE).get(id) as IDBRequest<GameRecord | undefined>);
}

export async function deleteGame(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearGames(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countGames(): Promise<number> {
  const db = await openDb();
  return toPromise(db.transaction(STORE).objectStore(STORE).count());
}

function buildPredicate(filter: GameFilter): (record: GameRecord) => boolean {
  const text = filter.text?.trim().toLowerCase();
  const eco = filter.eco?.trim().toUpperCase();
  return (record) => {
    if (text && !record.whiteLower.includes(text) && !record.blackLower.includes(text) && !record.openingLower.includes(text)) {
      return false;
    }
    if (eco && !(record.eco ?? '').toUpperCase().startsWith(eco)) return false;
    if (filter.result && record.result !== filter.result) return false;
    if (filter.origin && record.origin !== filter.origin) return false;
    if (filter.dateFrom !== undefined && record.playedAt < filter.dateFrom) return false;
    if (filter.dateTo !== undefined && record.playedAt > filter.dateTo) return false;
    return true;
  };
}

/**
 * Queries games, newest first. When a FEN is supplied the position index narrows the
 * candidate set first; otherwise a reverse cursor over `playedAt` streams records and
 * stops once `limit` matches are collected.
 */
export async function queryGames(filter: GameFilter = {}, limit = 300): Promise<GameRecord[]> {
  const db = await openDb();
  const predicate = buildPredicate(filter);

  if (filter.fen && filter.fen.trim()) {
    const key = normaliseFen(filter.fen);
    const store = db.transaction(STORE).objectStore(STORE);
    const ids = await toPromise(store.index('positions').getAllKeys(key) as IDBRequest<IDBValidKey[]>);
    const records = await Promise.all(ids.map((id) => getGame(String(id))));
    return records
      .filter((record): record is GameRecord => Boolean(record))
      .filter(predicate)
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, limit);
  }

  return new Promise<GameRecord[]>((resolve, reject) => {
    const out: GameRecord[] = [];
    const store = db.transaction(STORE).objectStore(STORE);
    const cursorRequest = store.index('playedAt').openCursor(null, 'prev');
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      const record = cursor.value as GameRecord;
      if (predicate(record)) out.push(record);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

/* ------------------------------------------------------------------ */
/* Review cache                                                        */
/* ------------------------------------------------------------------ */

interface ReviewRecord {
  key: string;
  line: Line;
  review: GameReview;
  savedAt: number;
}

/**
 * A content hash of a line (start position + the moves played), independent of any
 * assessments already attached — so a game maps to the same key before and after review.
 */
export function lineKey(line: Line): string {
  return hashId(`${line.startFen}::${line.moves.map((move) => move.uci).join(' ')}`);
}

/** Stores a completed review (the reviewed line + its summary) for later reuse. */
export async function putReview(line: Line, review: GameReview): Promise<void> {
  if (line.moves.length === 0) return;
  const record: ReviewRecord = { key: lineKey(line), line, review, savedAt: Date.now() };
  const db = await openDb();
  const tx = db.transaction(REVIEW_STORE, 'readwrite');
  tx.objectStore(REVIEW_STORE).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Looks up a cached review for `line`; returns null on a miss. */
export async function getCachedReview(line: Line): Promise<{ line: Line; review: GameReview } | null> {
  if (line.moves.length === 0) return null;
  const db = await openDb();
  const record = await toPromise(
    db.transaction(REVIEW_STORE).objectStore(REVIEW_STORE).get(lineKey(line)) as IDBRequest<ReviewRecord | undefined>,
  );
  if (!record) return null;
  // Guard against a hash collision: the move count must match.
  if (record.line.moves.length !== line.moves.length) return null;
  return { line: record.line, review: record.review };
}
