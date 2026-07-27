'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PieceStyleId } from '@/types';
import type { Lang } from '@/lib/i18n/translations';
import { DEFAULT_THEME_ID } from '@/lib/theme/boardThemes';

/** The persisted, serialisable half of the settings store. */
export interface SettingsValues {
  language: Lang;
  boardThemeId: string;
  pieceStyle: PieceStyleId;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  showEvalBar: boolean;
  showBestMoveArrow: boolean;
  showClassificationBadges: boolean;
  animationMs: number;
  engineDepth: number;
  multiPv: number;
  hashMb: number;
  liveAnalysis: boolean;
  /** Query Lichess' cloud eval cache before falling back to the local engine. */
  cloudEval: boolean;
  /** Use the Lichess 7-piece tablebase for exact endgame evaluations. */
  tablebase: boolean;
  reviewDepth: number;
  explorerDb: 'lichess' | 'masters';
  /** Play move/capture/check/blunder/game-end sound effects. */
  soundEnabled: boolean;
  /** Sound effect volume, 0–100. */
  soundVolume: number;
}

export interface SettingsState extends SettingsValues {
  set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]): void;
  resetDefaults(): void;
}

const DEFAULTS: SettingsValues = {
  language: 'en',
  boardThemeId: DEFAULT_THEME_ID,
  pieceStyle: 'classic',
  showCoordinates: true,
  showLegalMoves: true,
  showEvalBar: true,
  showBestMoveArrow: true,
  showClassificationBadges: true,
  animationMs: 220,
  engineDepth: 16,
  multiPv: 3,
  hashMb: 128,
  liveAnalysis: true,
  cloudEval: true,
  tablebase: true,
  reviewDepth: 16,
  explorerDb: 'lichess',
  soundEnabled: true,
  soundVolume: 65,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      resetDefaults: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'chess-studio:settings',
      storage: createJSONStorage(() => localStorage),
      // Hydrated manually from <AppShell> so server and client markup always match.
      skipHydration: true,
      version: 1,
    },
  ),
);

export const SETTINGS_DEFAULTS = DEFAULTS;
