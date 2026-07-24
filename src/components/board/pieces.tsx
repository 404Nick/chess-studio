'use client';

import type { CSSProperties, ReactElement } from 'react';
import type { PieceStyleId } from '@/types';

/** Solid Unicode chess glyphs — used for every non-"classic" piece style. */
const GLYPHS: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
};

const PIECE_KEYS = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const;

export type PieceKey = (typeof PIECE_KEYS)[number];

export interface CustomPieceProps {
  squareWidth: number;
  isDragging: boolean;
}

export type CustomPieceMap = Record<string, (props: CustomPieceProps) => ReactElement>;

interface GlyphSkin {
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadow: string;
}

function skinFor(style: Exclude<PieceStyleId, 'classic'>, white: boolean): GlyphSkin {
  switch (style) {
    case 'glyph':
      return white
        ? {
            fill: '#f7f4ec',
            stroke: '#22252c',
            strokeWidth: 1.4,
            shadow: '0 2px 4px rgba(0,0,0,0.45)',
          }
        : {
            fill: '#23262e',
            stroke: '#d9dde6',
            strokeWidth: 1.1,
            shadow: '0 2px 4px rgba(0,0,0,0.5)',
          };
    case 'neon':
      return white
        ? {
            fill: '#eaf4ff',
            stroke: '#3b6fd4',
            strokeWidth: 1.3,
            shadow: '0 0 12px rgba(110,168,254,0.85), 0 2px 4px rgba(0,0,0,0.5)',
          }
        : {
            fill: '#111a2b',
            stroke: '#26c6da',
            strokeWidth: 1.3,
            shadow: '0 0 12px rgba(38,198,218,0.7), 0 2px 4px rgba(0,0,0,0.55)',
          };
    case 'outline':
    default:
      return white
        ? {
            fill: 'rgba(255,255,255,0.12)',
            stroke: '#ffffff',
            strokeWidth: 1.7,
            shadow: '0 1px 3px rgba(0,0,0,0.55)',
          }
        : {
            fill: 'rgba(10,14,24,0.35)',
            stroke: '#93a2bd',
            strokeWidth: 1.7,
            shadow: '0 1px 3px rgba(0,0,0,0.5)',
          };
  }
}

function glyphStyle(skin: GlyphSkin, squareWidth: number, isDragging: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: squareWidth,
    height: squareWidth,
    fontSize: squareWidth * 0.82,
    lineHeight: 1,
    // The Unicode glyphs sit slightly high in most fonts.
    paddingBottom: squareWidth * 0.06,
    color: skin.fill,
    WebkitTextStroke: `${skin.strokeWidth}px ${skin.stroke}`,
    filter: `drop-shadow(${skin.shadow})`,
    transform: isDragging ? 'scale(1.08)' : 'none',
    transition: 'transform 120ms ease',
    userSelect: 'none',
    fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif',
  };
}

/**
 * Builds the `customPieces` map for react-chessboard.
 * Returns `undefined` for the "classic" style so the library's own vector set is used.
 */
export function buildCustomPieces(style: PieceStyleId): CustomPieceMap | undefined {
  if (style === 'classic') return undefined;

  const map: CustomPieceMap = {};

  for (const key of PIECE_KEYS) {
    const white = key[0] === 'w';
    const glyph = GLYPHS[key[1]];
    const skin = skinFor(style, white);

    map[key] = ({ squareWidth, isDragging }: CustomPieceProps) => (
      <div style={glyphStyle(skin, squareWidth, isDragging)}>{glyph}</div>
    );
  }

  return map;
}

/** Small standalone piece used by the studio palette and captured-material strips. */
export function PieceGlyph({
  piece,
  size = 26,
  style = 'glyph',
}: {
  piece: PieceKey;
  size?: number;
  style?: PieceStyleId;
}) {
  const white = piece[0] === 'w';
  const skin = skinFor(style === 'classic' ? 'glyph' : style, white);
  return (
    <span style={{ ...glyphStyle(skin, size, false), display: 'inline-flex' }} aria-hidden>
      {GLYPHS[piece[1]]}
    </span>
  );
}

export { PIECE_KEYS };
