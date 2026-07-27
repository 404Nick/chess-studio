'use client';

import type { GameTree } from '@/types';

/**
 * Local storage for opening repertoires and their spaced-repetition (SRS) state.
 *
 * A repertoire is just a {@link GameTree} — the same branching model as the analysis
 * board — tagged with the colour you play. SRS cards track, per position, how well you
 * recall your prepared move, using a simple Leitner box schedule.
 *
 * Kept in its own IndexedDB database so it is fully independent of the game library.
 */

const DB_NAME = 'chess-studio-repertoire';
const DB_VERSION = 1;
const REP_STORE = 'repertoires';
const SRS_STORE = 'srs';

export type RepertoireColor = 'white' | 'black';

export interface Repertoire {
  id: string;
  name: string;
  color: RepertoireColor;
  tree: GameTree;
  createdAt: number;
  updatedAt: number;
}

export interface SrsCard {
  /** `${repertoireId}::${fenKey}` */
  id: string;
  repertoireId: string;
  fen: string;
  /** Leitner box 0–5; higher means longer until it is due again. */
  box: number;
  /** Epoch ms when this card is next due. */
  due: number;
  correct: number;
  incorrect: number;
  lastReviewed: number;
}

/** Days until a card in each Leitner box becomes due again. */
const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];
const DAY_MS = 86_400_000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REP_STORE)) {
        db.createObjectStore(REP_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SRS_STORE)) {
        const store = db.createObjectStore(SRS_STORE, { keyPath: 'id' });
        store.createIndex('repertoireId', 'repertoireId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
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

function commit(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ------------------------------------------------------------------ */
/* Repertoires                                                         */
/* ------------------------------------------------------------------ */

export async function listRepertoires(): Promise<Repertoire[]> {
  const db = await openDb();
  const all = await toPromise(db.transaction(REP_STORE).objectStore(REP_STORE).getAll() as IDBRequest<Repertoire[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRepertoire(id: string): Promise<Repertoire | undefined> {
  const db = await openDb();
  return toPromise(db.transaction(REP_STORE).objectStore(REP_STORE).get(id) as IDBRequest<Repertoire | undefined>);
}

export async function putRepertoire(repertoire: Repertoire): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(REP_STORE, 'readwrite');
  tx.objectStore(REP_STORE).put({ ...repertoire, updatedAt: Date.now() });
  await commit(tx);
}

export async function deleteRepertoire(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([REP_STORE, SRS_STORE], 'readwrite');
  tx.objectStore(REP_STORE).delete(id);
  // Drop the repertoire's SRS cards too.
  const index = tx.objectStore(SRS_STORE).index('repertoireId');
  const cursorReq = index.openCursor(IDBKeyRange.only(id));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await commit(tx);
}

/* ------------------------------------------------------------------ */
/* SRS                                                                 */
/* ------------------------------------------------------------------ */

export function srsCardId(repertoireId: string, fenKey: string): string {
  return `${repertoireId}::${fenKey}`;
}

/** All SRS cards for a repertoire, keyed by their id. */
export async function getSrsCards(repertoireId: string): Promise<Map<string, SrsCard>> {
  const db = await openDb();
  const cards = await toPromise(
    db.transaction(SRS_STORE).objectStore(SRS_STORE).index('repertoireId').getAll(IDBKeyRange.only(repertoireId)) as IDBRequest<SrsCard[]>,
  );
  return new Map(cards.map((card) => [card.id, card]));
}

/** Advances (or resets) a card's schedule after a review and persists it. */
export async function reviewCard(
  repertoireId: string,
  fenKey: string,
  fen: string,
  correct: boolean,
  previous?: SrsCard,
): Promise<SrsCard> {
  const id = srsCardId(repertoireId, fenKey);
  const base: SrsCard = previous ?? {
    id,
    repertoireId,
    fen,
    box: 0,
    due: Date.now(),
    correct: 0,
    incorrect: 0,
    lastReviewed: 0,
  };
  const box = correct ? Math.min(base.box + 1, BOX_INTERVALS_DAYS.length - 1) : 0;
  const card: SrsCard = {
    ...base,
    fen,
    box,
    due: Date.now() + BOX_INTERVALS_DAYS[box] * DAY_MS,
    correct: base.correct + (correct ? 1 : 0),
    incorrect: base.incorrect + (correct ? 0 : 1),
    lastReviewed: Date.now(),
  };

  const db = await openDb();
  const tx = db.transaction(SRS_STORE, 'readwrite');
  tx.objectStore(SRS_STORE).put(card);
  await commit(tx);
  return card;
}
