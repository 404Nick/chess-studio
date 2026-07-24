'use client';

import { useCallback } from 'react';
import type { MoveClass } from '@/types';
import { useSettings } from '@/store/settingsStore';
import { type Lang, LANGUAGES, translations } from './translations';

export { type Lang, LANGUAGES };

export type TParams = Record<string, string | number>;

/** Resolves a key for a given language, falling back to English, then the key itself. */
export function translate(lang: Lang, key: string, params?: TParams): string {
  const raw = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

export type TFunction = (key: string, params?: TParams) => string;

/** Reactive translator bound to the current language setting. */
export function useTranslation(): { t: TFunction; lang: Lang } {
  const lang = useSettings((state) => state.language);
  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);
  return { t, lang };
}

/** Convenience: localized display name for a move classification. */
export function useClassLabel(classification: MoveClass): string {
  const lang = useSettings((state) => state.language);
  return translate(lang, `class.${classification}`);
}
