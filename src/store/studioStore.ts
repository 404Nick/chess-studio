'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoardShape, Chapter, GameHeaders, Line, MoveNode, Study } from '@/types';
import { START_FEN } from '@/lib/chess/fen';
import {
  type MoveInput,
  deleteFrom,
  emptyLine,
  goTo,
  parsePgn,
  playMove,
  updateNode,
} from '@/lib/chess/line';

/** Referentially stable empty array — see the note in `gameStore`. */
const NO_SHAPES: readonly BoardShape[] = [];

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function createChapter(name: string, startFen: string = START_FEN, line?: Line): Chapter {
  const now = Date.now();
  return {
    id: uid('ch'),
    name,
    description: '',
    line: line ?? emptyLine(startFen),
    headers: {},
    startShapes: [],
    orientation: 'white',
    createdAt: now,
    updatedAt: now,
  };
}

function createStudy(name = 'My first study'): Study {
  const chapter = createChapter('Chapter 1');
  return {
    id: uid('st'),
    name,
    chapters: [chapter],
    activeChapterId: chapter.id,
    updatedAt: Date.now(),
  };
}

export interface StudioState {
  study: Study;
  /** Working FEN inside the position editor (may be illegal while being built). */
  editorFen: string;
  editorOpen: boolean;

  /* study level */
  renameStudy(name: string): void;
  resetStudy(): void;

  /* chapters */
  addChapter(name?: string, startFen?: string): string;
  duplicateChapter(id: string): void;
  deleteChapter(id: string): void;
  selectChapter(id: string): void;
  renameChapter(id: string, name: string): void;
  setChapterDescription(id: string, description: string): void;
  setChapterHeaders(id: string, headers: GameHeaders): void;
  setChapterStart(fen: string): void;
  flipChapter(): void;

  /* moves within the active chapter */
  play(input: MoveInput | string): MoveNode | null;
  navigate(index: number): void;
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  truncateFrom(index: number): void;
  setComment(index: number, comment: string): void;
  setShapes(index: number, shapes: readonly BoardShape[]): void;
  toggleHighlight(index: number, shape: BoardShape): void;
  clearShapes(index: number): void;

  /* import / editor */
  importPgn(pgn: string, chapterName?: string): number;
  openEditor(fen: string): void;
  closeEditor(): void;
  setEditorFen(fen: string): void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => {
      const patchChapter = (id: string, patch: (chapter: Chapter) => Chapter) =>
        set((state) => ({
          study: {
            ...state.study,
            updatedAt: Date.now(),
            chapters: state.study.chapters.map((chapter) =>
              chapter.id === id ? { ...patch(chapter), updatedAt: Date.now() } : chapter,
            ),
          },
        }));

      const patchActive = (patch: (chapter: Chapter) => Chapter) => {
        const { study } = get();
        patchChapter(study.activeChapterId, patch);
      };

      const patchActiveLine = (patch: (line: Line) => Line) =>
        patchActive((chapter) => ({ ...chapter, line: patch(chapter.line) }));

      return {
        study: createStudy(),
        editorFen: START_FEN,
        editorOpen: false,

        renameStudy: (name) =>
          set((state) => ({ study: { ...state.study, name, updatedAt: Date.now() } })),

        resetStudy: () => set({ study: createStudy(), editorOpen: false, editorFen: START_FEN }),

        addChapter: (name, startFen = START_FEN) => {
          const { study } = get();
          const chapter = createChapter(name ?? `Chapter ${study.chapters.length + 1}`, startFen);
          set({
            study: {
              ...study,
              chapters: [...study.chapters, chapter],
              activeChapterId: chapter.id,
              updatedAt: Date.now(),
            },
          });
          return chapter.id;
        },

        duplicateChapter: (id) => {
          const { study } = get();
          const source = study.chapters.find((chapter) => chapter.id === id);
          if (!source) return;
          const copy: Chapter = {
            ...source,
            id: uid('ch'),
            name: `${source.name} (copy)`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set({
            study: {
              ...study,
              chapters: [...study.chapters, copy],
              activeChapterId: copy.id,
              updatedAt: Date.now(),
            },
          });
        },

        deleteChapter: (id) => {
          const { study } = get();
          if (study.chapters.length <= 1) return;
          const chapters = study.chapters.filter((chapter) => chapter.id !== id);
          const activeChapterId =
            study.activeChapterId === id ? chapters[chapters.length - 1].id : study.activeChapterId;
          set({ study: { ...study, chapters, activeChapterId, updatedAt: Date.now() } });
        },

        selectChapter: (id) =>
          set((state) => ({ study: { ...state.study, activeChapterId: id } })),

        renameChapter: (id, name) => patchChapter(id, (chapter) => ({ ...chapter, name })),

        setChapterDescription: (id, description) =>
          patchChapter(id, (chapter) => ({ ...chapter, description })),

        setChapterHeaders: (id, headers) =>
          patchChapter(id, (chapter) => ({ ...chapter, headers: { ...chapter.headers, ...headers } })),

        setChapterStart: (fen) =>
          patchActive((chapter) => ({ ...chapter, line: emptyLine(fen), startShapes: [] })),

        flipChapter: () =>
          patchActive((chapter) => ({
            ...chapter,
            orientation: chapter.orientation === 'white' ? 'black' : 'white',
          })),

        play: (input) => {
          const chapter = activeChapter(get());
          const result = playMove(chapter.line, input);
          if (!result) return null;
          patchActiveLine(() => result.line);
          return result.node;
        },

        navigate: (index) => patchActiveLine((line) => goTo(line, index)),
        first: () => patchActiveLine((line) => goTo(line, -1)),
        previous: () => patchActiveLine((line) => goTo(line, line.cursor - 1)),
        next: () => patchActiveLine((line) => goTo(line, line.cursor + 1)),
        last: () => patchActiveLine((line) => goTo(line, line.moves.length - 1)),

        truncateFrom: (index) => patchActiveLine((line) => deleteFrom(line, index)),

        setComment: (index, comment) => {
          if (index < 0) return;
          patchActiveLine((line) => updateNode(line, index, { comment }));
        },

        setShapes: (index, shapes) => {
          if (index < 0) {
            patchActive((chapter) => ({ ...chapter, startShapes: shapes }));
            return;
          }
          patchActiveLine((line) => updateNode(line, index, { shapes }));
        },

        toggleHighlight: (index, shape) => {
          const existing = studioShapesAt(get(), index);
          const match = existing.findIndex(
            (item) => item.kind === shape.kind && item.from === shape.from && item.to === shape.to,
          );
          const next =
            match >= 0
              ? existing.filter((_, i) => i !== match)
              : [...existing.filter((item) => !(item.kind === 'highlight' && item.from === shape.from)), shape];
          get().setShapes(index, next);
        },

        clearShapes: (index) => get().setShapes(index, []),

        importPgn: (pgn, chapterName) => {
          // A PGN file may contain several games; each becomes its own chapter.
          const chunks = pgn
            .split(/\n\s*\n(?=\[)/)
            .map((chunk) => chunk.trim())
            .filter(Boolean);

          const games = chunks.length > 1 ? regroupPgnGames(chunks) : [pgn.trim()];
          const created: Chapter[] = [];

          games.forEach((game, index) => {
            const parsed = parsePgn(game);
            if (parsed.line.moves.length === 0) return;
            const name =
              chapterName ??
              (parsed.headers.white && parsed.headers.black
                ? `${parsed.headers.white} – ${parsed.headers.black}`
                : `Imported chapter ${index + 1}`);
            created.push({
              ...createChapter(name, parsed.line.startFen, parsed.line),
              headers: parsed.headers,
            });
          });

          if (created.length === 0) return 0;

          set((state) => ({
            study: {
              ...state.study,
              chapters: [...state.study.chapters, ...created],
              activeChapterId: created[0].id,
              updatedAt: Date.now(),
            },
          }));

          return created.length;
        },

        openEditor: (fen) => set({ editorOpen: true, editorFen: fen }),
        closeEditor: () => set({ editorOpen: false }),
        setEditorFen: (fen) => set({ editorFen: fen }),
      };
    },
    {
      name: 'chess-studio:study',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
      partialize: (state) => ({ study: state.study }) as unknown as StudioState,
    },
  ),
);

/**
 * A PGN export can interleave header blocks and movetext; regroup the split chunks
 * so every game keeps its headers together with its moves.
 */
function regroupPgnGames(chunks: readonly string[]): string[] {
  const games: string[] = [];
  let buffer = '';

  for (const chunk of chunks) {
    const isHeaderBlock = chunk.startsWith('[');
    if (isHeaderBlock && buffer && /[a-hKQRBNO]/.test(buffer.replace(/\[[^\]]*\]/g, ''))) {
      games.push(buffer.trim());
      buffer = chunk;
    } else {
      buffer = buffer ? `${buffer}\n\n${chunk}` : chunk;
    }
  }
  if (buffer.trim()) games.push(buffer.trim());
  return games;
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function activeChapter(state: StudioState): Chapter {
  return (
    state.study.chapters.find((chapter) => chapter.id === state.study.activeChapterId) ??
    state.study.chapters[0]
  );
}

export function studioShapesAt(state: StudioState, index: number): readonly BoardShape[] {
  const chapter = activeChapter(state);
  if (index < 0) return chapter.startShapes;
  return chapter.line.moves[index]?.shapes ?? NO_SHAPES;
}

export function studioCurrentShapes(state: StudioState): readonly BoardShape[] {
  return studioShapesAt(state, activeChapter(state).line.cursor);
}
