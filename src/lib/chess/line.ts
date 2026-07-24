import { Chess, type Move } from 'chess.js';
import type { GameHeaders, Line, MoveNode, PieceSymbol, Score, Square } from '@/types';
import { START_FEN, fenFullmove } from './fen';

let nodeCounter = 0;

function nextId(): string {
  nodeCounter += 1;
  return `n${nodeCounter.toString(36)}`;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function emptyLine(startFen: string = START_FEN): Line {
  return { startFen, moves: [], cursor: -1 };
}

/** FEN of the position after `index` half-moves. `index === -1` is the start position. */
export function fenAt(line: Line, index: number): string {
  if (index < 0 || line.moves.length === 0) return line.startFen;
  const clamped = Math.min(index, line.moves.length - 1);
  return line.moves[clamped].fenAfter;
}

export function currentFen(line: Line): string {
  return fenAt(line, line.cursor);
}

/**
 * A `Chess` instance replayed from the start of the line up to `index`.
 * Replaying (rather than loading the stored FEN) preserves repetition history,
 * which matters for draw detection.
 */
export function chessAt(line: Line, index: number): Chess {
  let chess: Chess;
  try {
    chess = new Chess(line.startFen);
  } catch {
    // A hand-edited FEN can be unplayable; fall back so callers never throw.
    chess = new Chess(START_FEN);
    return chess;
  }
  const limit = Math.min(index, line.moves.length - 1);
  for (let i = 0; i <= limit; i += 1) {
    try {
      chess.move(line.moves[i].san);
    } catch {
      break;
    }
  }
  return chess;
}

export function chessAtCursor(line: Line): Chess {
  return chessAt(line, line.cursor);
}

function toNode(move: Move, fenBefore: string, fenAfter: string, ply: number, chess: Chess): MoveNode {
  return {
    id: nextId(),
    ply,
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    from: move.from as Square,
    to: move.to as Square,
    promotion: move.promotion as PieceSymbol | undefined,
    piece: move.piece as PieceSymbol,
    captured: move.captured as PieceSymbol | undefined,
    color: move.color,
    fenBefore,
    fenAfter,
    isCheck: chess.isCheck(),
    isMate: chess.isCheckmate(),
  };
}

export interface PlayResult {
  readonly line: Line;
  readonly node: MoveNode;
}

/**
 * Plays a move from the current cursor. Anything after the cursor is discarded,
 * which is the standard behaviour for an analysis board.
 */
export function playMove(line: Line, input: MoveInput | string): PlayResult | null {
  const chess = chessAtCursor(line);
  const fenBefore = chess.fen();

  let move: Move | null = null;
  try {
    move = chess.move(input as never);
  } catch {
    return null;
  }
  if (!move) return null;

  const kept = line.moves.slice(0, line.cursor + 1);
  const node = toNode(move, fenBefore, chess.fen(), kept.length + 1, chess);
  const moves = [...kept, node];

  return { line: { ...line, moves, cursor: moves.length - 1 }, node };
}

/** Builds a line by replaying SAN moves; unparsable moves stop the replay. */
export function lineFromSan(startFen: string, sanMoves: readonly string[]): Line {
  const chess = new Chess(startFen);
  const moves: MoveNode[] = [];

  for (const san of sanMoves) {
    const fenBefore = chess.fen();
    let move: Move | null = null;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    if (!move) break;
    moves.push(toNode(move, fenBefore, chess.fen(), moves.length + 1, chess));
  }

  return { startFen, moves, cursor: moves.length - 1 };
}

export function goTo(line: Line, index: number): Line {
  const clamped = Math.max(-1, Math.min(index, line.moves.length - 1));
  return clamped === line.cursor ? line : { ...line, cursor: clamped };
}

export function truncateAfter(line: Line, index: number): Line {
  const moves = line.moves.slice(0, index + 1);
  return { ...line, moves, cursor: Math.min(line.cursor, moves.length - 1) };
}

/** Removes the move at `index` and everything after it. */
export function deleteFrom(line: Line, index: number): Line {
  const moves = line.moves.slice(0, Math.max(0, index));
  return { ...line, moves, cursor: moves.length - 1 };
}

export function updateNode(line: Line, index: number, patch: Partial<MoveNode>): Line {
  if (index < 0 || index >= line.moves.length) return line;
  const moves = line.moves.slice();
  moves[index] = { ...moves[index], ...patch };
  return { ...line, moves };
}

/** Converts a UCI principal variation into SAN, in the context of `fen`. */
export function uciLineToSan(fen: string, uciMoves: readonly string[]): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const uci of uciMoves) {
    const parsed = parseUci(uci);
    if (!parsed) break;
    try {
      const move = chess.move(parsed as never);
      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

export function parseUci(uci: string): MoveInput | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci.length > 4 ? uci[4] : undefined) as PieceSymbol | undefined,
  };
}

/** Converts a single UCI move to SAN in the given position (null when illegal). */
export function uciToSan(fen: string, uci: string): string | null {
  const [san] = uciLineToSan(fen, [uci]);
  return san ?? null;
}

/** The full-move number this half-move belongs to. */
export function moveNumberFor(node: MoveNode): number {
  return fenFullmove(node.fenBefore);
}

export interface GameResultInfo {
  readonly over: boolean;
  readonly result: string;
  /** English fallback text. */
  readonly reason: string;
  /** i18n key for the reason, so the UI can localize it. */
  readonly reasonKey: string;
}

/**
 * Detects a position with **no legal moves** (checkmate or stalemate). These must never
 * be sent to the engine: the bundled stockfish.js hangs on them — it never replies with
 * `bestmove`, which wedges the worker for the rest of the session. Positions that are
 * "over" only by the fifty-move or repetition rule still have legal moves and are fine.
 *
 * Returns a white-POV score for the terminal position, or `null` when the position still
 * has legal moves.
 */
export function terminalScore(fen: string): { score: Score; checkmate: boolean } | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  if (chess.moves().length > 0) return null;

  if (chess.isCheckmate()) {
    // The side to move is mated. Encode as a mate score from White's point of view so
    // the evaluation bar leans the right way (win% 0 for a mated White, 100 for Black).
    const value = chess.turn() === 'w' ? -1 : 1;
    return { score: { kind: 'mate', value }, checkmate: true };
  }
  // Stalemate — a draw.
  return { score: { kind: 'cp', value: 0 }, checkmate: false };
}

export function describeResult(chess: Chess): GameResultInfo {
  if (!chess.isGameOver()) return { over: false, result: '*', reason: '', reasonKey: '' };
  if (chess.isCheckmate()) {
    const whiteMated = chess.turn() === 'w';
    return {
      over: true,
      result: whiteMated ? '0-1' : '1-0',
      reason: `${whiteMated ? 'Black' : 'White'} wins by checkmate`,
      reasonKey: whiteMated ? 'result.blackMate' : 'result.whiteMate',
    };
  }
  if (chess.isStalemate()) {
    return { over: true, result: '1/2-1/2', reason: 'Draw by stalemate', reasonKey: 'result.stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return {
      over: true,
      result: '1/2-1/2',
      reason: 'Draw by insufficient material',
      reasonKey: 'result.insufficient',
    };
  }
  if (chess.isThreefoldRepetition()) {
    return { over: true, result: '1/2-1/2', reason: 'Draw by repetition', reasonKey: 'result.repetition' };
  }
  return { over: true, result: '1/2-1/2', reason: 'Draw by the fifty-move rule', reasonKey: 'result.fiftyMove' };
}

/** Extracts SAN moves and headers from a PGN string without mutating global state. */
export interface ParsedPgn {
  readonly line: Line;
  readonly headers: GameHeaders;
}

const HEADER_MAP: Record<string, keyof GameHeaders> = {
  Event: 'event',
  Site: 'site',
  Date: 'date',
  UTCDate: 'date',
  Round: 'round',
  White: 'white',
  Black: 'black',
  Result: 'result',
  WhiteElo: 'whiteElo',
  BlackElo: 'blackElo',
  ECO: 'eco',
  Opening: 'opening',
  TimeControl: 'timeControl',
  Termination: 'termination',
};

export function parsePgn(pgn: string): ParsedPgn {
  const headers: GameHeaders = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match: RegExpExecArray | null;
  let fen: string | null = null;

  while ((match = headerRegex.exec(pgn)) !== null) {
    const [, key, value] = match;
    if (key === 'FEN') fen = value;
    const mapped = HEADER_MAP[key];
    if (mapped && value) headers[mapped] = value;
  }

  const chess = new Chess(fen ?? START_FEN);
  try {
    chess.loadPgn(pgn);
  } catch {
    // Fall through: some providers emit clock/eval comments that trip strict parsers.
    // Retry after stripping comments, variations and NAGs.
    const cleaned = pgn
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/\([^()]*\)/g, ' ');
    try {
      chess.loadPgn(cleaned);
    } catch {
      return { line: emptyLine(fen ?? START_FEN), headers };
    }
  }

  const san = chess.history();
  return { line: lineFromSan(fen ?? START_FEN, san), headers };
}
