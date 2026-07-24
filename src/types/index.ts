import type { Color, PieceSymbol, Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/** A raw engine score, always from the point of view of the side to move. */
export type Score =
  | { readonly kind: 'cp'; readonly value: number }
  | { readonly kind: 'mate'; readonly value: number };

/** One principal variation reported by the engine for a given position. */
export interface EngineLine {
  /** 1-based MultiPV index. */
  readonly multipv: number;
  /** Score from WHITE's point of view (already normalised — see `normaliseScore`). */
  readonly score: Score;
  readonly depth: number;
  readonly seldepth: number;
  /** UCI moves, e.g. ['e2e4', 'e7e5']. */
  readonly pv: readonly string[];
  /** `pv` converted to SAN in the context of the analysed position. */
  readonly san: readonly string[];
  readonly nodes: number;
  readonly nps: number;
  readonly timeMs: number;
}

/** Complete result of analysing one position. */
export interface PositionAnalysis {
  readonly fen: string;
  readonly depth: number;
  readonly lines: readonly EngineLine[];
  readonly bestMove: string | null;
  /** True while the engine is still working on this position. */
  readonly partial: boolean;
}

export type EngineStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'searching'
  | 'error'
  | 'unavailable';

export interface EngineOptions {
  /** Search depth for a single evaluation. */
  depth: number;
  /** Number of principal variations to report. */
  multiPv: number;
  /** Transposition table size, in MB. */
  hashMb: number;
  /** Optional per-search cap, in milliseconds. 0 = unlimited (depth-bound only). */
  moveTimeMs: number;
}

/* ------------------------------------------------------------------ */
/* Move quality                                                        */
/* ------------------------------------------------------------------ */

export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface MoveClassMeta {
  readonly id: MoveClass;
  readonly label: string;
  readonly glyph: string;
  readonly color: string;
  readonly ring: string;
  /** Short generic sentence used when no position-specific detail is available. */
  readonly blurb: string;
}

/** Everything the reviewer computed about a single played move. */
export interface MoveAssessment {
  readonly classification: MoveClass;
  /** Centipawn loss from the mover's point of view (>= 0). */
  readonly cpLoss: number;
  /** Drop in winning chances (percentage points, >= 0). */
  readonly winDrop: number;
  /** Best line in the position *before* the move. */
  readonly best: EngineLine | null;
  /** Second best line before the move, when MultiPV >= 2. */
  readonly secondBest: EngineLine | null;
  /** Evaluation after the move actually played, from WHITE's point of view. */
  readonly scoreAfter: Score;
  /** Evaluation before the move (best play), from WHITE's point of view. */
  readonly scoreBefore: Score;
  /** Human-readable paragraph explaining the move. */
  readonly explanation: string;
  /** Short supporting bullet points (tactical/positional observations). */
  readonly details: readonly string[];
  /** SAN of the engine's preferred move, when it differs from the move played. */
  readonly betterMove: string | null;
}

/* ------------------------------------------------------------------ */
/* Game line / move tree                                               */
/* ------------------------------------------------------------------ */

export interface BoardShape {
  readonly from: Square;
  readonly to: Square;
  /** Hex colour. Arrows and highlights share the palette. */
  readonly color: string;
  /** `from === to` means a square highlight rather than an arrow. */
  readonly kind: 'arrow' | 'highlight';
}

export interface MoveNode {
  readonly id: string;
  /** 1-based half-move number within the line. */
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PieceSymbol;
  readonly piece: PieceSymbol;
  readonly captured?: PieceSymbol;
  readonly color: Color;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly isCheck: boolean;
  readonly isMate: boolean;
  /** User annotation shown in the move list and exported to PGN. */
  comment?: string;
  /** User-drawn arrows/highlights attached to this position. */
  shapes?: readonly BoardShape[];
  /** Numeric Annotation Glyph, e.g. '!' '?' '!!' — exported to PGN. */
  nag?: string;
  /** Filled in by the reviewer. */
  assessment?: MoveAssessment;
}

/** A linear sequence of moves from a starting position. */
export interface Line {
  readonly startFen: string;
  readonly moves: readonly MoveNode[];
  /** Index of the last played move; -1 means "at the starting position". */
  readonly cursor: number;
}

export interface GameHeaders {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: string;
  blackElo?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
  termination?: string;
}

/* ------------------------------------------------------------------ */
/* Game review                                                         */
/* ------------------------------------------------------------------ */

export interface ReviewProgress {
  readonly done: number;
  readonly total: number;
  readonly running: boolean;
}

export interface AccuracyReport {
  readonly white: number;
  readonly black: number;
}

export type ClassCounts = Record<MoveClass, number>;

export interface GameReview {
  readonly accuracy: AccuracyReport;
  readonly counts: { readonly w: ClassCounts; readonly b: ClassCounts };
  readonly averageCpLoss: { readonly w: number; readonly b: number };
  /** Evaluation after every ply, white POV, in pawns (clamped for charting). */
  readonly evalSeries: readonly number[];
  readonly depth: number;
  readonly completedAt: number;
}

/* ------------------------------------------------------------------ */
/* Openings                                                            */
/* ------------------------------------------------------------------ */

export interface OpeningEntry {
  readonly eco: string;
  readonly name: string;
  /** SAN moves that define this line. */
  readonly moves: readonly string[];
}

export interface ExplorerMove {
  readonly uci: string;
  readonly san: string;
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly total: number;
  readonly averageRating: number | null;
}

export interface ExplorerStats {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly total: number;
  readonly opening: { readonly eco: string; readonly name: string } | null;
  readonly moves: readonly ExplorerMove[];
  readonly topGames: readonly ExplorerGame[];
}

export interface ExplorerGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly whiteRating: number | null;
  readonly blackRating: number | null;
  readonly winner: 'white' | 'black' | 'draw';
  readonly year: number | null;
}

/* ------------------------------------------------------------------ */
/* Player profiles                                                     */
/* ------------------------------------------------------------------ */

export type Platform = 'lichess' | 'chesscom';

export interface RemoteGame {
  readonly id: string;
  readonly platform: Platform;
  readonly url: string;
  readonly white: string;
  readonly black: string;
  readonly whiteRating: number | null;
  readonly blackRating: number | null;
  /** '1-0' | '0-1' | '1/2-1/2' | '*' */
  readonly result: string;
  readonly speed: string;
  readonly rated: boolean;
  readonly playedAt: number;
  readonly opening: string | null;
  readonly eco: string | null;
  readonly pgn: string;
  readonly initialFen: string | null;
}

export interface PlayerProfile {
  readonly platform: Platform;
  readonly username: string;
  readonly displayName: string;
  readonly url: string;
  readonly avatar: string | null;
  readonly title: string | null;
  readonly country: string | null;
  readonly ratings: readonly { readonly key: string; readonly label: string; readonly value: number }[];
  readonly totalGames: number | null;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface BoardTheme {
  readonly id: string;
  readonly label: string;
  readonly light: string;
  readonly dark: string;
  /** Extra CSS applied to the board wrapper (texture gradients). */
  readonly lightTexture?: string;
  readonly darkTexture?: string;
  readonly border: string;
  readonly coordinate: string;
  /** Colour used for the "last move" highlight. */
  readonly lastMove: string;
  readonly check: string;
  readonly selected: string;
  readonly glow?: string;
}

export type PieceStyleId = 'classic' | 'glyph' | 'neon' | 'outline';

export interface PieceStyle {
  readonly id: PieceStyleId;
  readonly label: string;
  readonly description: string;
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export interface Chapter {
  readonly id: string;
  name: string;
  /** Free-text introduction shown above the move list. */
  description: string;
  readonly line: Line;
  readonly headers: GameHeaders;
  /** Arrows/highlights attached to the chapter's starting position. */
  readonly startShapes: readonly BoardShape[];
  readonly orientation: 'white' | 'black';
  readonly createdAt: number;
  updatedAt: number;
}

export interface Study {
  readonly id: string;
  name: string;
  readonly chapters: readonly Chapter[];
  readonly activeChapterId: string;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export interface Toast {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly tone: 'info' | 'success' | 'warn' | 'error';
}
