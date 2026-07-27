'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { EngineStatus } from '@/types';
import { useEngine } from '@/hooks/useStockfish';
import { LANGUAGES, useTranslation } from '@/lib/i18n';
import { useSettings } from '@/store/settingsStore';
import { useStudio } from '@/store/studioStore';

const NAV = [
  { href: '/', key: 'nav.analysis' },
  { href: '/studio', key: 'nav.studio' },
  { href: '/library', key: 'nav.library' },
  { href: '/stats', key: 'nav.stats' },
  { href: '/repertoire', key: 'nav.repertoire' },
  { href: '/play', key: 'nav.play' },
];

const STATUS_KEY: Record<EngineStatus, string> = {
  idle: 'engine.idle',
  loading: 'engine.loading',
  ready: 'engine.ready',
  searching: 'engine.searching',
  error: 'engine.error',
  unavailable: 'engine.unavailable',
};

function statusTone(status: EngineStatus): string {
  if (status === 'ready' || status === 'searching') return '#7fce6b';
  if (status === 'loading') return '#f2c14e';
  return '#e5484d';
}

function EngineBadge() {
  const hashMb = useSettings((state) => state.hashMb);
  const { status, error, retry } = useEngine(hashMb);
  const { t } = useTranslation();
  const broken = status === 'error' || status === 'unavailable';
  const label = t(STATUS_KEY[status]);

  return (
    <div className="flex items-center gap-2">
      <span className="chip" title={error ?? label}>
        <span
          className={clsx('h-1.5 w-1.5 rounded-full', status === 'searching' && 'animate-pulse')}
          style={{ background: statusTone(status) }}
        />
        <span className="hidden sm:inline">{label}</span>
      </span>
      {broken ? (
        <button
          type="button"
          onClick={retry}
          className="text-[0.68rem] text-[var(--text-muted)] underline-offset-2 hover:text-white hover:underline"
        >
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

function LanguageToggle() {
  const language = useSettings((state) => state.language);
  const setSetting = useSettings((state) => state.set);

  return (
    <div className="flex gap-0.5 rounded-lg bg-black/25 p-0.5" role="group" aria-label="Language">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.id}
          type="button"
          onClick={() => setSetting('language', lang.id)}
          aria-pressed={language === lang.id}
          title={lang.label}
          className={clsx(
            'rounded-md px-2 py-1 text-[0.68rem] font-bold tracking-wide transition-colors',
            language === lang.id ? 'bg-white/[0.12] text-white' : 'text-[var(--text-muted)] hover:text-white',
          )}
        >
          {lang.short}
        </button>
      ))}
    </div>
  );
}

/**
 * Rehydrates the persisted stores after mount. Doing it here (rather than at import
 * time) guarantees the server-rendered markup matches the first client render.
 */
function useStoreHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([useSettings.persist.rehydrate(), useStudio.persist.rehydrate()]).finally(() =>
      setHydrated(true),
    );
  }, []);

  return hydrated;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useStoreHydration();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[rgba(7,9,15,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#5f9bfa] to-[#26c6da] text-base text-[#07090f] shadow-[0_6px_18px_-8px_rgba(95,155,250,0.9)]">
              ♞
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Chess<span className="text-[var(--accent)]">Studio</span>
            </span>
          </Link>

          <nav className="flex gap-1 rounded-xl bg-black/25 p-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    active ? 'bg-white/[0.10] text-white' : 'text-[var(--text-muted)] hover:text-white',
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <LanguageToggle />
            <EngineBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-4">
        {hydrated ? (
          children
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="skeleton aspect-square w-full max-w-3xl rounded-2xl" />
            <div className="skeleton h-[70vh] w-full rounded-2xl" />
          </div>
        )}
      </main>
    </div>
  );
}
