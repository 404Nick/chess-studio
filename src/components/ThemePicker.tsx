'use client';

import clsx from 'clsx';
import type { PieceStyleId } from '@/types';
import { BOARD_THEMES, PIECE_STYLES } from '@/lib/theme/boardThemes';
import { useSettings } from '@/store/settingsStore';
import { PieceGlyph } from './board/pieces';
import { PanelHeader, Slider, Toggle } from './ui/Primitives';

function ThemeSwatch({
  id,
  label,
  light,
  dark,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  light: string;
  dark: string;
  active: boolean;
  onSelect(id: string): void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={clsx(
        'group flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all',
        active
          ? 'border-[rgba(110,168,254,0.7)] bg-[rgba(110,168,254,0.10)] shadow-glow'
          : 'border-white/[0.08] hover:border-white/25 hover:bg-white/[0.04]',
      )}
    >
      <span className="grid h-10 w-10 grid-cols-2 grid-rows-2 overflow-hidden rounded-md shadow-inner">
        <span style={{ background: light }} />
        <span style={{ background: dark }} />
        <span style={{ background: dark }} />
        <span style={{ background: light }} />
      </span>
      <span className="text-[0.66rem] font-medium text-[var(--text-secondary)]">{label}</span>
    </button>
  );
}

export function ThemePicker() {
  const settings = useSettings();

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title="Appearance & engine" subtitle="Everything here is saved to this browser" />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <section>
          <p className="stat-label mb-2">Board theme</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {BOARD_THEMES.map((theme) => (
              <ThemeSwatch
                key={theme.id}
                id={theme.id}
                label={theme.label}
                light={theme.light}
                dark={theme.dark}
                active={settings.boardThemeId === theme.id}
                onSelect={(id) => settings.set('boardThemeId', id)}
              />
            ))}
          </div>
        </section>

        <section>
          <p className="stat-label mb-2">Piece style</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PIECE_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => settings.set('pieceStyle', style.id as PieceStyleId)}
                title={style.description}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl border p-2 transition-all',
                  settings.pieceStyle === style.id
                    ? 'border-[rgba(110,168,254,0.7)] bg-[rgba(110,168,254,0.10)] shadow-glow'
                    : 'border-white/[0.08] hover:border-white/25 hover:bg-white/[0.04]',
                )}
              >
                <span className="flex h-9 items-center">
                  {style.id === 'classic' ? (
                    <span className="text-2xl">♞</span>
                  ) : (
                    <PieceGlyph piece="wN" size={30} style={style.id} />
                  )}
                </span>
                <span className="text-[0.66rem] font-medium text-[var(--text-secondary)]">{style.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-1">
          <p className="stat-label mb-1">Board</p>
          <Toggle
            label="Coordinates"
            checked={settings.showCoordinates}
            onChange={(value) => settings.set('showCoordinates', value)}
          />
          <Toggle
            label="Legal move hints"
            hint="Dots on the squares a selected piece can reach"
            checked={settings.showLegalMoves}
            onChange={(value) => settings.set('showLegalMoves', value)}
          />
          <Toggle
            label="Evaluation bar"
            checked={settings.showEvalBar}
            onChange={(value) => settings.set('showEvalBar', value)}
          />
          <Toggle
            label="Best-move arrow"
            checked={settings.showBestMoveArrow}
            onChange={(value) => settings.set('showBestMoveArrow', value)}
          />
          <Toggle
            label="Move quality badges"
            hint="Animated icons on the board after each classified move"
            checked={settings.showClassificationBadges}
            onChange={(value) => settings.set('showClassificationBadges', value)}
          />
          <Slider
            label="Animation speed"
            min={0}
            max={600}
            step={20}
            value={settings.animationMs}
            onChange={(value) => settings.set('animationMs', value)}
            format={(value) => (value === 0 ? 'instant' : `${value}ms`)}
          />
        </section>

        <section className="space-y-1">
          <p className="stat-label mb-1">Engine</p>
          <Toggle
            label="Live analysis"
            hint="Evaluate the position continuously as you browse"
            checked={settings.liveAnalysis}
            onChange={(value) => settings.set('liveAnalysis', value)}
          />
          <Slider
            label="Live search depth"
            min={8}
            max={26}
            value={settings.engineDepth}
            onChange={(value) => settings.set('engineDepth', value)}
          />
          <Slider
            label="Candidate lines (MultiPV)"
            min={1}
            max={5}
            value={settings.multiPv}
            onChange={(value) => settings.set('multiPv', value)}
          />
          <Slider
            label="Game review depth"
            min={8}
            max={22}
            value={settings.reviewDepth}
            onChange={(value) => settings.set('reviewDepth', value)}
            format={(value) => `${value} (slower = sharper)`}
          />
          <Slider
            label="Hash size"
            min={16}
            max={256}
            step={16}
            value={settings.hashMb}
            onChange={(value) => settings.set('hashMb', value)}
            format={(value) => `${value} MB`}
          />
          <p className="pt-1 text-[0.66rem] leading-relaxed text-[var(--text-muted)]">
            Hash changes take effect the next time the engine restarts (reload the page).
          </p>
        </section>

        <button
          type="button"
          onClick={settings.resetDefaults}
          className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-white hover:underline"
        >
          Reset everything to defaults
        </button>
      </div>
    </div>
  );
}
