'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Study } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { Button, PanelHeader } from './ui/Primitives';

export function ChapterList({
  study,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
  onRenameStudy,
}: {
  study: Study;
  onSelect(id: string): void;
  onAdd(): void;
  onDelete(id: string): void;
  onRename(id: string, name: string): void;
  onDuplicate(id: string): void;
  onRenameStudy(name: string): void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const { t } = useTranslation();

  const commit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader
        title={t('studio.study')}
        actions={
          <Button onClick={onAdd} title={t('studio.addChapter')}>
            {t('studio.addChapter')}
          </Button>
        }
      />

      <div className="border-b border-white/[0.06] p-3">
        <input
          className="input font-semibold"
          value={study.name}
          onChange={(event) => onRenameStudy(event.target.value)}
          aria-label={t('studio.studyName')}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {study.chapters.map((chapter, index) => {
            const active = chapter.id === study.activeChapterId;
            return (
              <div
                key={chapter.id}
                className={clsx(
                  'group relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                  active ? 'bg-[rgba(110,168,254,0.14)]' : 'hover:bg-white/[0.05]',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="chapter-marker"
                    className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--accent)]"
                  />
                ) : null}

                <span className="w-5 shrink-0 text-right font-mono text-[0.66rem] text-[var(--text-muted)]">
                  {index + 1}
                </span>

                {editingId === chapter.id ? (
                  <input
                    autoFocus
                    className="input h-7 flex-1 py-0 text-xs"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commit();
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(chapter.id)}
                    onDoubleClick={() => {
                      setEditingId(chapter.id);
                      setDraft(chapter.name);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-[var(--text-primary)]"
                    title="Double-click to rename"
                  >
                    {chapter.name}
                    <span className="ml-1.5 font-mono text-[0.62rem] text-[var(--text-muted)]">
                      {chapter.line.moves.length}
                    </span>
                  </button>
                )}

                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => onDuplicate(chapter.id)}
                    title="Duplicate chapter"
                    className="rounded px-1 text-[0.7rem] text-[var(--text-muted)] hover:text-white"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(chapter.id)}
                    disabled={study.chapters.length <= 1}
                    title="Delete chapter"
                    className="rounded px-1 text-[0.7rem] text-[var(--text-muted)] hover:text-[#e5484d] disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
