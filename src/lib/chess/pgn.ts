import type { BoardShape, Chapter, GameHeaders, Line, MoveNode } from '@/types';
import { START_FEN } from './fen';
import { chessAt, describeResult, moveNumberFor } from './line';

/** Maps a hex colour onto the single-letter code used by the `%cal`/`%csl` PGN extension. */
function shapeColorCode(color: string): 'G' | 'R' | 'Y' | 'B' {
  const c = color.toLowerCase();
  if (c.includes('e5484d') || c.includes('ef4444') || c.startsWith('#f0')) return 'R';
  if (c.includes('f2c14e') || c.includes('eab308') || c.includes('fbbf24')) return 'Y';
  if (c.includes('6ea8fe') || c.includes('3b82f6') || c.includes('60a5fa')) return 'B';
  return 'G';
}

function encodeShapes(shapes: readonly BoardShape[] | undefined): string {
  if (!shapes || shapes.length === 0) return '';
  const arrows = shapes.filter((s) => s.kind === 'arrow');
  const squares = shapes.filter((s) => s.kind === 'highlight');
  const parts: string[] = [];
  if (arrows.length) {
    parts.push(`[%cal ${arrows.map((s) => `${shapeColorCode(s.color)}${s.from}${s.to}`).join(',')}]`);
  }
  if (squares.length) {
    parts.push(`[%csl ${squares.map((s) => `${shapeColorCode(s.color)}${s.from}`).join(',')}]`);
  }
  return parts.join(' ');
}

function escapeHeader(value: string): string {
  return value.replace(/[\\"]/g, '\\$&');
}

function formatDate(value: string | undefined): string {
  if (!value) return '????.??.??';
  // Accept both "2024-05-01" and "2024.05.01".
  const normalised = value.replace(/-/g, '.');
  return /^\d{4}\.\d{2}\.\d{2}$/.test(normalised) ? normalised : '????.??.??';
}

export interface PgnOptions {
  /** Include `{...}` comments and `[%cal]`/`[%csl]` shape annotations. */
  includeComments?: boolean;
  /** Include the assessment produced by the engine review as a comment. */
  includeAnalysis?: boolean;
  /** Wrap the movetext at this column. */
  wrapAt?: number;
}

function commentFor(node: MoveNode, options: PgnOptions): string {
  const chunks: string[] = [];

  if (options.includeAnalysis && node.assessment) {
    const { assessment } = node;
    const score =
      assessment.scoreAfter.kind === 'mate'
        ? `#${assessment.scoreAfter.value}`
        : (assessment.scoreAfter.value / 100).toFixed(2);
    chunks.push(`[%eval ${score}]`);
    chunks.push(`${assessment.classification}: ${assessment.explanation}`);
  }

  if (options.includeComments !== false) {
    const shapes = encodeShapes(node.shapes);
    if (shapes) chunks.push(shapes);
    if (node.comment?.trim()) chunks.push(node.comment.trim());
  }

  if (chunks.length === 0) return '';
  return `{ ${chunks.join(' ').replace(/[{}]/g, '')} }`;
}

function wrap(tokens: readonly string[], width: number): string {
  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    if (current.length === 0) {
      current = token;
    } else if (current.length + 1 + token.length <= width) {
      current += ` ${token}`;
    } else {
      lines.push(current);
      current = token;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

/** Serialises a single line (with annotations) into standard PGN. */
export function lineToPgn(line: Line, headers: GameHeaders = {}, options: PgnOptions = {}): string {
  const width = options.wrapAt ?? 80;
  const finalChess = chessAt(line, line.moves.length - 1);
  const outcome = describeResult(finalChess);
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

  if (line.startFen !== START_FEN) {
    tags.push(['SetUp', '1']);
    tags.push(['FEN', line.startFen]);
  }
  if (headers.whiteElo) tags.push(['WhiteElo', headers.whiteElo]);
  if (headers.blackElo) tags.push(['BlackElo', headers.blackElo]);
  if (headers.eco) tags.push(['ECO', headers.eco]);
  if (headers.opening) tags.push(['Opening', headers.opening]);
  if (headers.timeControl) tags.push(['TimeControl', headers.timeControl]);
  if (headers.termination) tags.push(['Termination', headers.termination]);

  const headerBlock = tags.map(([k, v]) => `[${k} "${escapeHeader(v)}"]`).join('\n');

  const tokens: string[] = [];
  let lastNumberWritten = -1;

  line.moves.forEach((node) => {
    const number = moveNumberFor(node);
    if (node.color === 'w') {
      tokens.push(`${number}.`);
      lastNumberWritten = number;
    } else if (lastNumberWritten !== number) {
      tokens.push(`${number}...`);
      lastNumberWritten = number;
    }

    tokens.push(node.nag ? `${node.san}${node.nag}` : node.san);

    const comment = commentFor(node, options);
    if (comment) {
      tokens.push(comment);
      // PGN requires the move number to be repeated after a comment, so a following
      // black move prints as "12..." rather than continuing bare.
      lastNumberWritten = -1;
    }
  });

  tokens.push(result);

  return `${headerBlock}\n\n${wrap(tokens, width)}\n`;
}

/** Serialises a whole study: one PGN game per chapter, separated by blank lines. */
export function studyToPgn(
  studyName: string,
  chapters: readonly Chapter[],
  options: PgnOptions = {},
): string {
  return chapters
    .map((chapter, index) => {
      const headers: GameHeaders = {
        ...chapter.headers,
        event: chapter.headers.event ?? studyName,
        round: chapter.headers.round ?? String(index + 1),
      };
      const body = lineToPgn(chapter.line, headers, options);
      const intro = chapter.description.trim();
      const chapterTag = `[ChapterName "${escapeHeader(chapter.name)}"]`;
      const withChapter = body.replace(/\n\n/, `\n${chapterTag}\n\n`);
      return intro ? withChapter.replace(/\n\n/, `\n\n{ ${intro.replace(/[{}]/g, '')} }\n`) : withChapter;
    })
    .join('\n\n');
}

/** Triggers a browser download for arbitrary text content. */
export function downloadText(filename: string, content: string, mime = 'application/x-chess-pgn'): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9\-_ ]/gi, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'chess-studio'
  );
}
