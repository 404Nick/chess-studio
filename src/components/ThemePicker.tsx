'use client';

import clsx from 'clsx';
import type { PieceStyleId } from '@/types';
import { BOARD_THEMES, PIECE_STYLES } from '@/lib/theme/boardThemes';
import { LANGUAGES, useTranslation } from '@/lib/i18n';
import { useSettings } from '@/store/settingsStore';
import { PieceGlyph } from './board/pieces';
import { PanelHeader, Select, Slider, Toggle } from './ui/Primitives';

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
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <Select
          label={t('settings.language')}
          value={settings.language}
          onChange={(value) => settings.set('language', value)}
          options={LANGUAGES.map((lang) => ({ value: lang.id, label: lang.label }))}
        />

        <section>
          <p className="stat-label mb-2">{t('settings.boardTheme')}</p>
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
          <p className="stat-label mb-2">{t('settings.pieceStyle')}</p>
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
          <p className="stat-label mb-1">{t('settings.board')}</p>
          <Toggle
            label={t('settings.coordinates')}
            checked={settings.showCoordinates}
            onChange={(value) => settings.set('showCoordinates', value)}
          />
          <Toggle
            label={t('settings.legalMoves')}
            hint={t('settings.legalMovesHint')}
            checked={settings.showLegalMoves}
            onChange={(value) => settings.set('showLegalMoves', value)}
          />
          <Toggle
            label={t('settings.evalBar')}
            checked={settings.showEvalBar}
            onChange={(value) => settings.set('showEvalBar', value)}
          />
          <Toggle
            label={t('settings.bestMoveArrow')}
            checked={settings.showBestMoveArrow}
            onChange={(value) => settings.set('showBestMoveArrow', value)}
          />
          <Toggle
            label={t('settings.badges')}
            hint={t('settings.badgesHint')}
            checked={settings.showClassificationBadges}
            onChange={(value) => settings.set('showClassificationBadges', value)}
          />
          <Slider
            label={t('settings.animationSpeed')}
            min={0}
            max={600}
            step={20}
            value={settings.animationMs}
            onChange={(value) => settings.set('animationMs', value)}
            format={(value) => (value === 0 ? t('settings.instant') : `${value}ms`)}
          />
        </section>

        <section className="space-y-1">
          <p className="stat-label mb-1">{t('settings.engine')}</p>
          <Toggle
            label={t('settings.live')}
            hint={t('settings.liveHint')}
            checked={settings.liveAnalysis}
            onChange={(value) => settings.set('liveAnalysis', value)}
          />
          <Slider
            label={t('settings.liveDepth')}
            min={8}
            max={26}
            value={settings.engineDepth}
            onChange={(value) => settings.set('engineDepth', value)}
          />
          <Slider
            label={t('settings.multipv')}
            min={1}
            max={5}
            value={settings.multiPv}
            onChange={(value) => settings.set('multiPv', value)}
          />
          <Slider
            label={t('settings.reviewDepth')}
            min={8}
            max={22}
            value={settings.reviewDepth}
            onChange={(value) => settings.set('reviewDepth', value)}
            format={(value) => t('settings.reviewDepthFmt', { n: value })}
          />
          <Slider
            label={t('settings.hash')}
            min={16}
            max={256}
            step={16}
            value={settings.hashMb}
            onChange={(value) => settings.set('hashMb', value)}
            format={(value) => `${value} MB`}
          />
          <p className="pt-1 text-[0.66rem] leading-relaxed text-[var(--text-muted)]">
            {t('settings.hashNote')}
          </p>
        </section>

        <button
          type="button"
          onClick={settings.resetDefaults}
          className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-white hover:underline"
        >
          {t('settings.reset')}
        </button>
      </div>
    </div>
  );
}
