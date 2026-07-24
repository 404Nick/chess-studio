import type { OpeningEntry } from '@/types';
import { OPENING_ROWS } from './openings.data';

export const OPENINGS: readonly OpeningEntry[] = OPENING_ROWS.map((row) => {
  const [eco, name, moves] = row.split('|');
  return { eco, name, moves: moves.split(' ').filter(Boolean) };
});

/** Exact SAN sequence -> entry. */
const BY_SEQUENCE = new Map<string, OpeningEntry>();
/** Longest sequence stored, used to bound the prefix search. */
let MAX_PLIES = 0;

for (const entry of OPENINGS) {
  const key = entry.moves.join(' ');
  // Later rows are more specific variations; keep the first (most canonical) name
  // for a sequence but never lose a longer line.
  if (!BY_SEQUENCE.has(key)) BY_SEQUENCE.set(key, entry);
  MAX_PLIES = Math.max(MAX_PLIES, entry.moves.length);
}

export interface OpeningMatch {
  readonly entry: OpeningEntry;
  /** Number of half-moves that the named line covers. */
  readonly plies: number;
  /** True when the current line goes exactly as far as the book entry. */
  readonly exact: boolean;
}

/**
 * Finds the most specific book line that is a prefix of `sanMoves`.
 * Returns `null` before the first known move.
 */
export function findOpening(sanMoves: readonly string[]): OpeningMatch | null {
  const limit = Math.min(sanMoves.length, MAX_PLIES);
  for (let length = limit; length > 0; length -= 1) {
    const key = sanMoves.slice(0, length).join(' ');
    const entry = BY_SEQUENCE.get(key);
    if (entry) return { entry, plies: length, exact: length === sanMoves.length };
  }
  return null;
}

/** Book continuations one ply deeper than the current position. */
export function bookContinuations(sanMoves: readonly string[]): { san: string; entry: OpeningEntry }[] {
  const prefix = sanMoves.join(' ');
  const seen = new Set<string>();
  const out: { san: string; entry: OpeningEntry }[] = [];

  for (const entry of OPENINGS) {
    if (entry.moves.length <= sanMoves.length) continue;
    const candidatePrefix = entry.moves.slice(0, sanMoves.length).join(' ');
    if (candidatePrefix !== prefix) continue;
    const next = entry.moves[sanMoves.length];
    if (seen.has(next)) continue;
    seen.add(next);
    out.push({ san: next, entry });
  }

  return out;
}

/** Free-text search across the book, used by the opening browser. */
export function searchOpenings(query: string, limit = 40): OpeningEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return OPENINGS.slice(0, limit);
  return OPENINGS.filter(
    (entry) => entry.name.toLowerCase().includes(needle) || entry.eco.toLowerCase().includes(needle),
  ).slice(0, limit);
}

/** How many opening half-moves the given line still matches — used to flag "book" moves. */
export function bookPlyCount(sanMoves: readonly string[]): number {
  return findOpening(sanMoves)?.plies ?? 0;
}
