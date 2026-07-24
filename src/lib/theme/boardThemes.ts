import type { BoardTheme, PieceStyle, PieceStyleId } from '@/types';

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: 'wood',
    label: 'Walnut',
    light: '#e8d3ad',
    dark: '#a9743f',
    lightTexture:
      'repeating-linear-gradient(102deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0) 3px, rgba(120,72,20,0.09) 6px)',
    darkTexture:
      'repeating-linear-gradient(96deg, rgba(255,255,255,0.10) 0px, rgba(0,0,0,0) 4px, rgba(60,30,4,0.20) 9px)',
    border: 'rgba(255, 232, 190, 0.16)',
    coordinate: '#3a2410',
    lastMove: 'rgba(255, 214, 92, 0.48)',
    check: 'rgba(229, 72, 77, 0.62)',
    selected: 'rgba(120, 220, 160, 0.42)',
    glow: 'rgba(200, 150, 80, 0.25)',
  },
  {
    id: 'marble',
    label: 'Marble',
    light: '#e9e6e0',
    dark: '#7f8996',
    lightTexture:
      'radial-gradient(120% 120% at 20% 10%, rgba(255,255,255,0.85), rgba(214,210,201,0.35) 60%, rgba(180,176,168,0.35))',
    darkTexture:
      'radial-gradient(120% 120% at 75% 20%, rgba(190,199,210,0.55), rgba(96,106,119,0.5) 55%, rgba(60,68,79,0.65))',
    border: 'rgba(230, 235, 245, 0.18)',
    coordinate: '#2b3038',
    lastMove: 'rgba(122, 186, 255, 0.42)',
    check: 'rgba(229, 72, 77, 0.6)',
    selected: 'rgba(126, 214, 176, 0.4)',
    glow: 'rgba(150, 175, 210, 0.22)',
  },
  {
    id: 'neon',
    label: 'Neon Dark',
    light: '#22283b',
    dark: '#141827',
    lightTexture:
      'linear-gradient(135deg, rgba(110,168,254,0.16), rgba(38,198,218,0.06) 60%, rgba(0,0,0,0))',
    darkTexture: 'linear-gradient(135deg, rgba(110,168,254,0.07), rgba(0,0,0,0) 65%)',
    border: 'rgba(110, 168, 254, 0.35)',
    coordinate: '#8fa4c8',
    lastMove: 'rgba(110, 168, 254, 0.42)',
    check: 'rgba(255, 79, 106, 0.6)',
    selected: 'rgba(38, 198, 218, 0.42)',
    glow: 'rgba(110, 168, 254, 0.4)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    light: '#e5eddc',
    dark: '#4b7a52',
    border: 'rgba(220, 245, 220, 0.16)',
    coordinate: '#1f3324',
    lastMove: 'rgba(255, 226, 112, 0.45)',
    check: 'rgba(229, 72, 77, 0.6)',
    selected: 'rgba(90, 200, 250, 0.38)',
    glow: 'rgba(110, 190, 130, 0.22)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    light: '#43506b',
    dark: '#28304a',
    lightTexture: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(0,0,0,0))',
    border: 'rgba(160, 180, 220, 0.18)',
    coordinate: '#c3cde3',
    lastMove: 'rgba(150, 200, 255, 0.4)',
    check: 'rgba(255, 96, 120, 0.6)',
    selected: 'rgba(120, 230, 200, 0.38)',
    glow: 'rgba(90, 120, 190, 0.28)',
  },
  {
    id: 'coral',
    label: 'Coral',
    light: '#f6e5da',
    dark: '#c67a63',
    border: 'rgba(255, 230, 220, 0.18)',
    coordinate: '#4a2a20',
    lastMove: 'rgba(255, 214, 92, 0.45)',
    check: 'rgba(200, 40, 60, 0.6)',
    selected: 'rgba(90, 200, 250, 0.38)',
    glow: 'rgba(210, 130, 105, 0.25)',
  },
];

export const DEFAULT_THEME_ID = 'neon';

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === id) ?? BOARD_THEMES[2];
}

export const PIECE_STYLES: readonly PieceStyle[] = [
  { id: 'classic', label: 'Classic', description: 'Traditional Cburnett-style vector pieces.' },
  { id: 'glyph', label: 'Glyph', description: 'Clean typographic pieces with soft shading.' },
  { id: 'neon', label: 'Neon', description: 'Glowing outlines tuned for the dark themes.' },
  { id: 'outline', label: 'Outline', description: 'Minimal line-art pieces, maximum clarity.' },
];

export function getPieceStyle(id: string): PieceStyle {
  return PIECE_STYLES.find((style) => style.id === id) ?? PIECE_STYLES[0];
}

/** Palette offered for user-drawn arrows and square highlights. */
export const SHAPE_COLORS: readonly { id: string; label: string; value: string }[] = [
  { id: 'green', label: 'Green', value: '#3fb950' },
  { id: 'red', label: 'Red', value: '#e5484d' },
  { id: 'blue', label: 'Blue', value: '#6ea8fe' },
  { id: 'yellow', label: 'Yellow', value: '#f2c14e' },
];

export const DEFAULT_SHAPE_COLOR = SHAPE_COLORS[0].value;

export type { PieceStyleId };
