'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Color, PieceSymbol } from '@/types';
import { type PieceKey, PieceGlyph } from './pieces';

const CHOICES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

/**
 * The app draws its own promotion picker instead of relying on the board library's
 * built-in dialog, so click-moves and drag-moves behave identically.
 */
export function PromotionOverlay({
  open,
  color,
  onSelect,
  onCancel,
}: {
  open: boolean;
  color: Color;
  onSelect(piece: PieceSymbol): void;
  onCancel(): void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/65 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="panel flex flex-col items-center gap-3 px-5 py-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="panel-title">Promote to</p>
            <div className="flex gap-2">
              {CHOICES.map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => onSelect(piece)}
                  aria-label={`Promote to ${piece.toUpperCase()}`}
                  className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] transition-all hover:border-[rgba(110,168,254,0.7)] hover:bg-white/[0.10] active:scale-95"
                >
                  <PieceGlyph piece={`${color}${piece.toUpperCase()}` as PieceKey} size={38} style="glyph" />
                </button>
              ))}
            </div>
            <button type="button" onClick={onCancel} className="text-xs text-[var(--text-muted)] hover:text-white">
              Cancel
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
