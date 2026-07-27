'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardShape, Square } from '@/types';
import { currentFen, describeResult, chessAtCursor, parseUci } from '@/lib/chess/line';
import { fenTurn } from '@/lib/chess/fen';
import { downloadText, lineToPgn, safeFilename, studyToPgn } from '@/lib/chess/pgn';
import { findOpening } from '@/lib/openings';
import { playMoveSound } from '@/lib/sound/sounds';
import { SHAPE_COLORS, getTheme } from '@/lib/theme/boardThemes';
import { useBoardShortcuts } from '@/hooks/useBoardShortcuts';
import { useEngine, useLiveAnalysis } from '@/hooks/useStockfish';
import { useTranslation } from '@/lib/i18n';
import { activeChapter, studioCurrentShapes, useStudio } from '@/store/studioStore';
import { useSettings } from '@/store/settingsStore';
import { BoardControls } from '@/components/BoardControls';
import { ChapterList } from '@/components/ChapterList';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { EngineLines } from '@/components/EngineLines';
import { EvalBar } from '@/components/EvalBar';
import { MoveList } from '@/components/MoveList';
import { StudioEditor } from '@/components/StudioEditor';
import { Button, Panel, PanelHeader } from '@/components/ui/Primitives';

export default function StudioPage() {
  const settings = useSettings();
  const { t } = useTranslation();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);

  const study = useStudio((state) => state.study);
  const chapter = useStudio(activeChapter);
  const shapes = useStudio(studioCurrentShapes);
  const editorOpen = useStudio((state) => state.editorOpen);
  const editorFen = useStudio((state) => state.editorFen);

  const {
    play,
    navigate,
    first,
    previous,
    next,
    last,
    setComment,
    setShapes,
    truncateFrom,
    addChapter,
    deleteChapter,
    selectChapter,
    renameChapter,
    duplicateChapter,
    renameStudy,
    setChapterDescription,
    setChapterStart,
    flipChapter,
    importPgn,
    openEditor,
    closeEditor,
    setEditorFen,
  } = useStudio();

  const [shapeColor, setShapeColor] = useState(SHAPE_COLORS[0].value);
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const line = chapter.line;
  const fen = useMemo(() => currentFen(line), [line]);
  const turn = useMemo(() => fenTurn(fen), [fen]);
  const node = line.cursor >= 0 ? line.moves[line.cursor] : null;
  const outcome = useMemo(() => describeResult(chessAtCursor(line)), [line]);

  const opening = useMemo(
    () => findOpening(line.moves.slice(0, line.cursor + 1).map((move) => move.san)),
    [line],
  );

  const engine = useEngine(settings.hashMb);

  // See the analysis page: defer the first search past the mount commit.
  const [analysisArmed, setAnalysisArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAnalysisArmed(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  const { analysis, thinking, source } = useLiveAnalysis(fen, {
    enabled:
      analysisArmed &&
      settings.liveAnalysis &&
      (engine.ready || settings.cloudEval || settings.tablebase) &&
      !editorOpen,
    depth: settings.engineDepth,
    multiPv: settings.multiPv,
    cloudEval: settings.cloudEval,
    tablebase: settings.tablebase,
  });

  useBoardShortcuts(
    { onPrevious: previous, onNext: next, onFirst: first, onLast: last, onFlip: flipChapter },
    !editorOpen,
  );

  const handleMove = useCallback(
    (move: BoardMove) => {
      const played = play(move);
      if (!played) return false;
      const s = useSettings.getState();
      if (s.soundEnabled) {
        const over = chessAtCursor(activeChapter(useStudio.getState()).line).isGameOver();
        playMoveSound(played, { volume: s.soundVolume, gameOver: over });
      }
      return true;
    },
    [play],
  );

  const handleShapes = useCallback(
    (nextShapes: BoardShape[]) => setShapes(line.cursor, nextShapes),
    [setShapes, line.cursor],
  );

  const flash = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2600);
  }, []);

  const exportChapter = useCallback(() => {
    const pgn = lineToPgn(line, { ...chapter.headers, event: study.name }, { includeComments: true });
    downloadText(`${safeFilename(chapter.name)}.pgn`, pgn);
  }, [line, chapter, study.name]);

  const exportStudy = useCallback(() => {
    const pgn = studyToPgn(study.name, study.chapters, { includeComments: true });
    downloadText(`${safeFilename(study.name)}.pgn`, pgn);
  }, [study]);

  const runImport = useCallback(() => {
    const value = importText.trim();
    if (!value) return;
    const count = importPgn(value);
    setImportText('');
    setImportOpen(false);
    flash(
      count > 1
        ? t('studio.importedN', { n: count })
        : count === 1
          ? t('studio.imported1')
          : t('studio.importedNone'),
    );
  }, [importText, importPgn, flash, t]);

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_24rem]">
      {/* ============================== chapters ============================== */}
      <div className="flex flex-col gap-3">
        <Panel className="flex max-h-[32rem] min-h-[18rem] flex-col overflow-hidden">
          <ChapterList
            study={study}
            onSelect={selectChapter}
            onAdd={() => addChapter()}
            onDelete={deleteChapter}
            onRename={renameChapter}
            onDuplicate={duplicateChapter}
            onRenameStudy={renameStudy}
          />
        </Panel>

        <Panel className="space-y-2 p-3">
          <p className="panel-title">{t('studio.exportImport')}</p>
          <Button className="w-full" onClick={exportChapter}>
            {t('studio.exportChapter')}
          </Button>
          <Button className="w-full" onClick={exportStudy}>
            {t('studio.exportStudy')}
          </Button>
          <Button
            className="w-full"
            variant={importOpen ? 'primary' : 'default'}
            onClick={() => setImportOpen((value) => !value)}
          >
            {t('studio.importPgn')}
          </Button>

          <AnimatePresence>
            {importOpen ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <textarea
                  className="input h-24 resize-none font-mono text-[0.68rem]"
                  placeholder={t('studio.pastePgn')}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  spellCheck={false}
                />
                <Button variant="primary" className="w-full" onClick={runImport} disabled={!importText.trim()}>
                  {t('studio.createChapters')}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {notice ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[0.68rem] text-[var(--accent)]"
              >
                {notice}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </Panel>
      </div>

      {/* ============================== board / editor ============================== */}
      <div className="flex flex-col gap-3">
        {editorOpen ? (
          <Panel className="p-3">
            <PanelHeader title={t('editor.title')} subtitle={t('editor.subtitle')} />
            <div className="pt-3">
              <StudioEditor
                fen={editorFen}
                onChange={setEditorFen}
                onApply={(value) => {
                  setChapterStart(value);
                  closeEditor();
                  flash(t('studio.chapterReset'));
                }}
                onCancel={closeEditor}
                theme={theme}
                pieceStyle={settings.pieceStyle}
                orientation={chapter.orientation}
              />
            </div>
          </Panel>
        ) : (
          <Panel className="p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{chapter.name}</p>
                <p className="truncate text-[0.68rem] text-[var(--text-muted)]">
                  {outcome.over
                    ? t(outcome.reasonKey)
                    : t(turn === 'w' ? 'board.whiteToMove' : 'board.blackToMove')}
                  {opening ? ` · ${opening.entry.eco} ${opening.entry.name}` : ''}
                </p>
              </div>

              <BoardControls
                onFirst={first}
                onPrevious={previous}
                onNext={next}
                onLast={last}
                onFlip={flipChapter}
                canPrevious={line.cursor >= 0}
                canNext={line.cursor < line.moves.length - 1}
              >
                <Button className="ml-1" onClick={() => openEditor(fen)}>
                  {t('studio.editPosition')}
                </Button>
              </BoardControls>
            </div>

            <div className="flex gap-2.5">
              {settings.showEvalBar ? (
                <EvalBar
                  score={analysis.lines[0]?.score ?? null}
                  orientation={chapter.orientation}
                  thinking={thinking}
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <BoardSurface
                  fen={fen}
                  orientation={chapter.orientation}
                  theme={theme}
                  pieceStyle={settings.pieceStyle}
                  onMove={handleMove}
                  lastMove={node ? { from: node.from as Square, to: node.to as Square } : null}
                  shapes={shapes}
                  onShapesChange={handleShapes}
                  shapeColor={shapeColor}
                  bestMove={settings.showBestMoveArrow ? (analysis.lines[0]?.pv[0] ?? null) : null}
                  showCoordinates={settings.showCoordinates}
                  showLegalMoves={settings.showLegalMoves}
                  animationMs={settings.animationMs}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="stat-label mr-1">{t('board.draw')}</span>
                {SHAPE_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setShapeColor(color.value)}
                    aria-label={`${color.label} arrows`}
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: color.value,
                      borderColor: shapeColor === color.value ? '#fff' : 'transparent',
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setShapes(line.cursor, [])}
                  className="ml-1 text-[0.68rem] text-[var(--text-muted)] hover:text-white"
                >
                  {t('common.clear')}
                </button>
              </div>

              {line.cursor >= 0 ? (
                <button
                  type="button"
                  onClick={() => truncateFrom(line.cursor)}
                  className="text-[0.68rem] text-[var(--text-muted)] hover:text-white"
                >
                  {t('board.deleteFromHere')}
                </button>
              ) : null}
            </div>
          </Panel>
        )}

        <Panel className="p-3">
          <p className="panel-title mb-2">{t('studio.notes')}</p>
          <textarea
            className="input h-20 resize-none text-xs leading-relaxed"
            placeholder={t('studio.notesPlaceholder')}
            value={chapter.description}
            onChange={(event) => setChapterDescription(chapter.id, event.target.value)}
          />
        </Panel>
      </div>

      {/* ============================== moves & engine ============================== */}
      <div className="flex flex-col gap-3">
        <Panel className="flex max-h-[28rem] min-h-[18rem] flex-col overflow-hidden">
          <PanelHeader title={t('moves.title')} subtitle={t('moves.count', { n: line.moves.length })} />
          <MoveList line={line} onSelect={navigate} showBadges={false} />
          {line.cursor >= 0 ? (
            <div className="border-t border-white/[0.06] p-2">
              <textarea
                className="input h-16 resize-none text-xs"
                placeholder={t('studio.commentPlaceholder', { san: node?.san ?? '' })}
                value={node?.comment ?? ''}
                onChange={(event) => setComment(line.cursor, event.target.value)}
              />
            </div>
          ) : null}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title={t('studio.engine')}
            subtitle={
              engine.ready ? t('analysis.subtitle', { depth: settings.engineDepth }) : t('engine.unavailable')
            }
          />
          <EngineLines
            lines={analysis.lines}
            turn={turn}
            thinking={thinking}
            depth={settings.engineDepth}
            solved={source === 'tablebase'}
            onPlayMove={(uci) => {
              const parsed = parseUci(uci);
              if (parsed) play(parsed);
            }}
          />
        </Panel>
      </div>
    </div>
  );
}
