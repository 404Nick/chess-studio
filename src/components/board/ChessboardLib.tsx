'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, CSSProperties } from 'react';
import type { Square } from '@/types';
import type { CustomPieceMap } from './pieces';

/** `[from, to, colour]` — the tuple shape react-chessboard uses for arrows. */
export type ArrowTuple = [Square, Square, string?];

/**
 * A locally declared prop surface for react-chessboard. Declaring it here (instead of
 * importing the library's own types) keeps our call sites type-checked while staying
 * resilient to upstream type-export churn.
 */
export interface ChessboardLibProps {
  id?: string;
  position: string;
  boardOrientation?: 'white' | 'black';
  boardWidth?: number;
  animationDuration?: number;
  arePiecesDraggable?: boolean;
  areArrowsAllowed?: boolean;
  showBoardNotation?: boolean;
  snapToCursor?: boolean;
  autoPromoteToQueen?: boolean;
  customArrows?: ArrowTuple[];
  customArrowColor?: string;
  customBoardStyle?: CSSProperties;
  customLightSquareStyle?: CSSProperties;
  customDarkSquareStyle?: CSSProperties;
  customSquareStyles?: Record<string, CSSProperties>;
  customDropSquareStyle?: CSSProperties;
  customPieces?: CustomPieceMap;
  onArrowsChange?(arrows: ArrowTuple[]): void;
  onPieceDrop?(sourceSquare: Square, targetSquare: Square, piece: string): boolean;
  onSquareClick?(square: Square, piece?: string): void;
  onSquareRightClick?(square: Square): void;
  onPieceDragBegin?(piece: string, sourceSquare: Square): void;
  onPieceDragEnd?(piece: string, sourceSquare: Square): void;
  onPromotionCheck?(sourceSquare: Square, targetSquare: Square, piece: string): boolean;
  isDraggablePiece?(args: { piece: string; sourceSquare: Square }): boolean;
}

function BoardSkeleton() {
  return (
    <div className="aspect-square w-full animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.03]" />
  );
}

export const ChessboardLib = dynamic(
  () =>
    import('react-chessboard').then(
      (mod) => mod.Chessboard as unknown as ComponentType<ChessboardLibProps>,
    ),
  { ssr: false, loading: () => <BoardSkeleton /> },
);
