import type { GameHeaders, GameTree, MoveNode } from '@/types';
import { START_FEN, fenFullmove } from './fen';
import { describeResult } from './line';
import { chessAtNode, emptyTree, mainline, nodeOf, playMove } from './tree';

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface TreePgnOptions {
  includeComments?: boolean;
  includeAnalysis?: boolean;
  wrapAt?: number;
}

function escapeHeader(value: string): string {
  return value.replace(/[\\"]/g, '\\$&');
}

function formatDate(value: string | undefined): string {
  if (!value) return '????.??.??';
  const normalised = value.replace(/-/g, '.');
  return /^\d{4}\.\d{2}\.\d{2}$/.test(normalised) ? normalised : '????.??.??';
}

function commentFor(node: MoveNode, options: TreePgnOptions): string {
  const chunks: string[] = [];
  if (options.includeAnalysis && node.assessment) {
    const { assessment } = node;
    const score =
      assessment.scoreAfter.kind === 'mate'
        ? `#${assessment.scoreAfter.value}`
        : (assessment.scoreAfter.value / 100).toFixed(2);
    chunks.push(`[%eval ${score}]`);
  }
  if (options.includeComments !== false && node.comment?.trim()) {
    chunks.push(node.comment.trim());
  }
  if (chunks.length === 0) return '';
  return `{ ${chunks.join(' ').replace(/[{}]/g, '')} }`;
}

function moveToken(node: MoveNode, forceNumber: boolean): string {
  const number = fenFullmove(node.fenBefore);
  const san = node.nag ? `${node.san}${node.nag}` : node.san;
  if (node.color === 'w') return `${number}. ${san}`;
  if (forceNumber) return `${number}... ${san}`;
  return san;
}

/** Recursively renders a continuation: mainline plus `( … )` variations. */
function renderContinuation(tree: GameTree, childIds: readonly string[], forceNumber: boolean, options: TreePgnOptions): string {
  if (childIds.length === 0) return '';
  const [mainId, ...variationIds] = childIds;
  const node = nodeOf(tree, mainId);
  if (!node) return '';

  const parts: string[] = [moveToken(node, forceNumber)];

  const comment = commentFor(node, options);
  if (comment) parts.push(comment);

  for (const variationId of variationIds) {
    parts.push(`(${renderContinuation(tree, [variationId], true, options).trim()})`);
  }

  // After a comment or a variation block, a following black move must reprint its number.
  const nextForce = variationIds.length > 0 || comment.length > 0;
  const continuation = renderContinuation(tree, tree.nodes[mainId].children, nextForce, options);
  if (continuation) parts.push(continuation);

  return parts.join(' ');
}

function wrap(text: string, width: number): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    if (current.length === 0) current = token;
    else if (current.length + 1 + token.length <= width) current += ` ${token}`;
    else {
      lines.push(current);
      current = token;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

/** Serialises a whole move tree (mainline + variations) to standard PGN. */
export function treeToPgn(tree: GameTree, headers: GameHeaders = {}, options: TreePgnOptions = {}): string {
  const line = mainline(tree);
  const lastId = line.length > 0 ? line[line.length - 1].id : null;
  const outcome = describeResult(chessAtNode(tree, lastId));
  const result = headers.result ?? (outcome.over ? outcome.result : '*');

  const tags: [string, string][] = [
    ['Event', headers.event ?? 'Chess Studio Analysis'],
    ['Site', headers.site ?? 'Chess Studio'],
    ['Date', formatDate(headers.date)],
    ['Round', headers.round ?? '-'],
    ['White', headers.white ?? 'White'],
    ['Black', headers.black ?? 'Black'],
    ['Result', result],
  ];
  if (tree.startFen !== START_FEN) {
    tags.push(['SetUp', '1']);
    tags.push(['FEN', tree.startFen]);
  }
  if (headers.whiteElo) tags.push(['WhiteElo', headers.whiteElo]);
  if (headers.blackElo) tags.push(['BlackElo', headers.blackElo]);
  if (headers.eco) tags.push(['ECO', headers.eco]);
  if (headers.opening) tags.push(['Opening', headers.opening]);

  const headerBlock = tags.map(([k, v]) => `[${k} "${escapeHeader(v)}"]`).join('\n');
  const body = renderContinuation(tree, tree.rootChildren, true, options);
  const movetext = wrap(`${body} ${result}`.trim(), options.wrapAt ?? 80);

  return `${headerBlock}\n\n${movetext}\n`;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

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

type Token =
  | { kind: 'move'; san: string }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'comment'; text: string }
  | { kind: 'result' };

/** Splits movetext into moves, variation parens and comments (comments never nest). */
function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = movetext.length;

  while (i < n) {
    const ch = movetext[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === '{') {
      const end = movetext.indexOf('}', i);
      const stop = end === -1 ? n : end;
      tokens.push({ kind: 'comment', text: movetext.slice(i + 1, stop).trim() });
      i = stop + 1;
    } else if (ch === ';') {
      const end = movetext.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
    } else if (ch === '(') {
      tokens.push({ kind: 'open' });
      i += 1;
    } else if (ch === ')') {
      tokens.push({ kind: 'close' });
      i += 1;
    } else if (ch === '$') {
      i += 1;
      while (i < n && /\d/.test(movetext[i])) i += 1; // skip NAG code
    } else {
      let j = i;
      while (j < n && !/[\s(){};]/.test(movetext[j])) j += 1;
      const raw = movetext.slice(i, j);
      i = j;
      if (raw === '1-0' || raw === '0-1' || raw === '1/2-1/2' || raw === '*') {
        tokens.push({ kind: 'result' });
        continue;
      }
      // Strip a leading move number ("12." / "12...") and trailing "?!"-style glyphs.
      const san = raw.replace(/^\d+\.*/, '').replace(/[?!]+$/, '');
      if (san) tokens.push({ kind: 'move', san });
    }
  }
  return tokens;
}

export interface ParsedTree {
  readonly tree: GameTree;
  readonly headers: GameHeaders;
}

/**
 * Parses a single PGN game into a move tree, preserving variations. Unparsable moves
 * end the current line (or variation) gracefully rather than throwing.
 */
export function parsePgnToTree(pgn: string): ParsedTree {
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

  const movetext = pgn.replace(/\[[^\]]*\]/g, ' ').trim();
  const tokens = tokenize(movetext);

  let tree = emptyTree(fen ?? START_FEN);
  let cursor: string | null = null;
  const stack: (string | null)[] = [];
  let lastPlayed: string | null = null;

  for (const token of tokens) {
    if (token.kind === 'move') {
      const played = playMove({ ...tree, cursor }, token.san);
      if (!played) continue; // skip an illegal move rather than aborting the whole game
      tree = played.tree;
      cursor = tree.cursor;
      lastPlayed = cursor;
    } else if (token.kind === 'open') {
      // A variation branches from the position *before* the last move.
      stack.push(cursor);
      cursor = tree.nodes[cursor ?? '']?.parentId ?? null;
    } else if (token.kind === 'close') {
      cursor = stack.pop() ?? null;
      lastPlayed = cursor;
    } else if (token.kind === 'comment' && lastPlayed) {
      const existing = tree.nodes[lastPlayed]?.move.comment;
      const text = existing ? `${existing} ${token.text}` : token.text;
      tree = { ...tree, nodes: { ...tree.nodes, [lastPlayed]: { ...tree.nodes[lastPlayed], move: { ...tree.nodes[lastPlayed].move, comment: text } } } };
    }
  }

  // Leave the cursor at the end of the mainline, matching how games open elsewhere.
  const line = mainline(tree);
  return { tree: { ...tree, cursor: line.length ? line[line.length - 1].id : null }, headers };
}
