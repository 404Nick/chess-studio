import type { ClassCounts } from '@/types';
import { CLASS_ORDER } from '@/lib/analysis/classify';
import type { GameRecord } from './gamesDb';

function emptyCounts(): ClassCounts {
  return CLASS_ORDER.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as ClassCounts);
}

function addCounts(into: ClassCounts, from: ClassCounts | undefined): void {
  if (!from) return;
  for (const key of CLASS_ORDER) into[key] += from[key] ?? 0;
}

/** Win/draw/loss tally with a derived score percentage. */
export interface Record3 {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points-per-game as a percentage: (wins + draws/2) / games * 100. */
  score: number;
}

export interface OpeningStat {
  key: string;
  name: string;
  count: number;
  /** Present only in the player-focused view. */
  record?: Record3;
}

export interface PlayerStats {
  name: string;
  games: number;
  overall: Record3;
  asWhite: Record3;
  asBlack: Record3;
  bestOpenings: OpeningStat[];
  worstOpenings: OpeningStat[];
  /** Average review accuracy (from batch/analysis reviews), null when none reviewed. */
  accuracy: { overall: number | null; white: number | null; black: number | null };
  reviewedGames: number;
  /** The player's own move-class counts (brilliant … blunder), summed across reviews. */
  classCounts: ClassCounts;
}

export interface LibraryStats {
  total: number;
  reviewed: number;
  decisive: number;
  draws: number;
  /** Whole-library result split. */
  results: { white: number; black: number; draw: number };
  topOpenings: OpeningStat[];
  perYear: { year: number; count: number }[];
  ratingBuckets: { label: string; count: number }[];
  player: PlayerStats | null;
}

type Side = 'w' | 'b';

function outcome(record: GameRecord, side: Side): 'win' | 'draw' | 'loss' | null {
  if (record.result === '1/2-1/2') return 'draw';
  if (record.result === '1-0') return side === 'w' ? 'win' : 'loss';
  if (record.result === '0-1') return side === 'b' ? 'win' : 'loss';
  return null; // unfinished / unknown
}

function emptyRecord(): Record3 {
  return { games: 0, wins: 0, draws: 0, losses: 0, score: 0 };
}

function tally(record: Record3, result: 'win' | 'draw' | 'loss'): void {
  record.games += 1;
  if (result === 'win') record.wins += 1;
  else if (result === 'draw') record.draws += 1;
  else record.losses += 1;
}

function finalizeScore(record: Record3): Record3 {
  record.score = record.games > 0 ? Math.round(((record.wins + record.draws / 2) / record.games) * 1000) / 10 : 0;
  return record;
}

/** The best rating either player brought to a game, for a coarse strength histogram. */
function peakRating(record: GameRecord): number | null {
  const values = [record.whiteElo, record.blackElo].filter((v): v is number => typeof v === 'number');
  return values.length ? Math.max(...values) : null;
}

const RATING_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '<1200', min: 0, max: 1199 },
  { label: '1200–1599', min: 1200, max: 1599 },
  { label: '1600–1999', min: 1600, max: 1999 },
  { label: '2000–2399', min: 2000, max: 2399 },
  { label: '2400+', min: 2400, max: Infinity },
];

/**
 * Aggregates a set of games. When `player` is given (matched case-insensitively against
 * either colour), a perspective view is added: score as White vs Black and the openings
 * that treat that player best and worst.
 */
export function computeStats(games: readonly GameRecord[], player?: string): LibraryStats {
  const needle = player?.trim().toLowerCase();
  // When a player is focused, the whole dashboard reflects only their games.
  const scoped = needle
    ? games.filter((record) => record.whiteLower.includes(needle) || record.blackLower.includes(needle))
    : games;

  const results = { white: 0, black: 0, draw: 0 };
  const openingCounts = new Map<string, { name: string; count: number }>();
  const yearCounts = new Map<number, number>();
  const ratingCounts = RATING_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));
  let reviewed = 0;

  for (const record of scoped) {
    if (record.reviewedAt) reviewed += 1;
    if (record.result === '1-0') results.white += 1;
    else if (record.result === '0-1') results.black += 1;
    else if (record.result === '1/2-1/2') results.draw += 1;

    const key = record.eco || record.opening || 'Unknown';
    const name = record.opening || record.eco || 'Unknown opening';
    const entry = openingCounts.get(key) ?? { name, count: 0 };
    entry.count += 1;
    openingCounts.set(key, entry);

    if (record.playedAt > 0) {
      const year = new Date(record.playedAt).getUTCFullYear();
      yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    }

    const rating = peakRating(record);
    if (rating !== null) {
      const index = RATING_BUCKETS.findIndex((bucket) => rating >= bucket.min && rating <= bucket.max);
      if (index >= 0) ratingCounts[index].count += 1;
    }
  }

  const topOpenings: OpeningStat[] = [...openingCounts.entries()]
    .map(([key, value]) => ({ key, name: value.name, count: value.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const perYear = [...yearCounts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);

  let playerStats: PlayerStats | null = null;
  if (needle) {
    const asWhite = emptyRecord();
    const asBlack = emptyRecord();
    const overall = emptyRecord();
    const perOpening = new Map<string, OpeningStat & { record: Record3 }>();
    const whiteAcc: number[] = [];
    const blackAcc: number[] = [];
    const classCounts = emptyCounts();

    for (const record of scoped) {
      // Substring match so "carlsen" finds "Carlsen, Magnus" as well as a bare username.
      const isWhite = record.whiteLower.includes(needle);
      const isBlack = record.blackLower.includes(needle);
      if (!isWhite && !isBlack) continue;
      const side: Side = isWhite ? 'w' : 'b';
      const result = outcome(record, side);
      if (!result) continue;

      tally(side === 'w' ? asWhite : asBlack, result);
      tally(overall, result);

      if (isWhite) {
        if (typeof record.accuracyWhite === 'number') whiteAcc.push(record.accuracyWhite);
        addCounts(classCounts, record.countsWhite);
      }
      if (isBlack) {
        if (typeof record.accuracyBlack === 'number') blackAcc.push(record.accuracyBlack);
        addCounts(classCounts, record.countsBlack);
      }

      const key = record.eco || record.opening || 'Unknown';
      const opening = perOpening.get(key) ?? {
        key,
        name: record.opening || record.eco || 'Unknown opening',
        count: 0,
        record: emptyRecord(),
      };
      opening.count += 1;
      tally(opening.record, result);
      perOpening.set(key, opening);
    }

    const ranked = [...perOpening.values()]
      .filter((opening) => opening.record.games >= 2)
      .map((opening) => ({ ...opening, record: finalizeScore(opening.record) }));

    const avg = (values: number[]): number | null =>
      values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

    playerStats = {
      name: player!.trim(),
      games: overall.games,
      overall: finalizeScore(overall),
      asWhite: finalizeScore(asWhite),
      asBlack: finalizeScore(asBlack),
      bestOpenings: [...ranked].sort((a, b) => b.record.score - a.record.score).slice(0, 5),
      worstOpenings: [...ranked].sort((a, b) => a.record.score - b.record.score).slice(0, 5),
      accuracy: { overall: avg([...whiteAcc, ...blackAcc]), white: avg(whiteAcc), black: avg(blackAcc) },
      reviewedGames: whiteAcc.length + blackAcc.length,
      classCounts,
    };
  }

  return {
    total: scoped.length,
    reviewed,
    decisive: results.white + results.black,
    draws: results.draw,
    results,
    topOpenings,
    perYear,
    ratingBuckets: ratingCounts,
    player: playerStats,
  };
}
