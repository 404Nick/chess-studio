'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PieceStyleId } from '@/types';
import { DEFAULT_THEME_ID } from '@/lib/theme/boardThemes';

/** The persisted, serialisable half of the settings store. */
export interface SettingsValues {
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
  reviewDepth: number;
  explorerDb: 'lichess' | 'masters';
}

export interface SettingsState extends SettingsValues {
  set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]): void;
  resetDefaults(): void;
}

const DEFAULTS: SettingsValues = {
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
  hashMb: 32,
  liveAnalysis: true,
  reviewDepth: 14,
  explorerDb: 'lichess',
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
