'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Color, Square } from '@/types';
import { chessAtCursor, currentFen, describeResult, emptyLine, parseUci, playMove } from '@/lib/chess/line';
import { START_FEN, fenTurn } from '@/lib/chess/fen';
import { lineToPgn } from '@/lib/chess/pgn';
import { disposePlayEngine, getPlayEngine } from '@/lib/engine/engineManager';
import { getTheme } from '@/lib/theme/boardThemes';
import { playMoveSound } from '@/lib/sound/sounds';
import { useTranslation } from '@/lib/i18n';
import { useGame } from '@/store/gameStore';
import { useSettings } from '@/store/settingsStore';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { MoveList } from '@/components/MoveList';
import { Button, Panel, PanelHeader, Slider } from '@/components/ui/Primitives';

type ColorChoice = 'white' | 'black' | 'random';

/** A coarse label for a Skill Level, for the strength slider. */
function strengthKey(skill: number): string {
  if (skill <= 3) return 'play.beginner';
  if (skill <= 7) return 'play.casual';
  if (skill <= 12) return 'play.intermediate';
  if (skill <= 17) return 'play.advanced';
  return 'play.master';
}

export default function PlayPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useSettings();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);

  const [line, setLine] = useState(() => emptyLine(START_FEN));
  const [colorChoice, setColorChoice] = useState<ColorChoice>('white');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [skill, setSkill] = useState(8);
  const [started, setStarted] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [thinking, setThinking] = useState(false);
  const movingRef = useRef(false);

  const fen = useMemo(() => currentFen(line), [line]);
  const outcome = useMemo(() => describeResult(chessAtCursor(line)), [line]);
  const gameOver = outcome.over || resigned;
  const turn = fenTurn(fen);

  // Dispose the opponent engine when leaving the page.
  useEffect(() => () => disposePlayEngine(), []);

  const soundFor = useCallback(
    (node: Parameters<typeof playMoveSound>[0], over: boolean) => {
      if (settings.soundEnabled) playMoveSound(node, { volume: settings.soundVolume, gameOver: over });
    },
    [settings.soundEnabled, settings.soundVolume],
  );

  // Engine plays whenever it is its turn.
  useEffect(() => {
    if (!started || resigned) return undefined;
    const chess = chessAtCursor(line);
    if (chess.isGameOver() || chess.turn() === playerColor || movingRef.current) return undefined;

    movingRef.current = true;
    let cancelled = false;
    setThinking(true);
    const searchFen = currentFen(line);

    (async () => {
      try {
        const engine = await getPlayEngine(settings.hashMb);
        engine.setSkillLevel(skill);
        engine.setEloLimit(null);
        const result = await engine.analyse({
          fen: searchFen,
          depth: skill < 10 ? 6 : 14,
          multiPv: 1,
          moveTimeMs: 120 + skill * 45,
        });
        if (cancelled) return;
        const uci = result.bestMove ?? result.lines[0]?.pv[0];
        const parsed = uci ? parseUci(uci) : null;
        const played = parsed ? playMove(line, parsed) : null;
        if (played) {
          setLine(played.line);
          soundFor(played.node, chessAtCursor(played.line).isGameOver());
        }
      } catch {
        // Engine unavailable — leave it as the player's turn.
      } finally {
        if (!cancelled) setThinking(false);
        movingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      movingRef.current = false;
    };
  }, [line, started, resigned, playerColor, skill, settings.hashMb, soundFor]);

  const newGame = useCallback(() => {
    const resolved: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice === 'white' ? 'w' : 'b';
    movingRef.current = false;
    setResigned(false);
    setThinking(false);
    setPlayerColor(resolved);
    setLine(emptyLine(START_FEN));
    setStarted(true);
  }, [colorChoice]);

  const handleMove = useCallback(
    (move: BoardMove): boolean => {
      if (!started || gameOver || movingRef.current) return false;
      const chess = chessAtCursor(line);
      if (chess.turn() !== playerColor) return false;
      const played = playMove(line, move);
      if (!played) return false;
      setLine(played.line);
      soundFor(played.node, chessAtCursor(played.line).isGameOver());
      return true;
    },
    [started, gameOver, line, playerColor, soundFor],
  );

  const analyseGame = useCallback(() => {
    if (line.moves.length === 0) return;
    const you = t('play.you');
    const pgn = lineToPgn(line, {
      event: t('play.title'),
      white: playerColor === 'w' ? you : 'Stockfish',
      black: playerColor === 'w' ? 'Stockfish' : you,
    });
    if (useGame.getState().loadPgn(pgn)) router.push('/');
  }, [line, playerColor, router, t]);

  const node = line.cursor >= 0 ? line.moves[line.cursor] : null;

  const statusText = (() => {
    if (!started) return t('play.notStarted');
    if (gameOver) {
      if (resigned) return t('play.youResigned');
      if (outcome.result === '1/2-1/2') return t('play.drawn');
      const playerWon = (outcome.result === '1-0') === (playerColor === 'w');
      return playerWon ? t('play.youWon') : t('play.youLost');
    }
    if (thinking) return t('play.thinking');
    return turn === playerColor ? t('play.yourMove') : t('play.waiting');
  })();

  return (
    <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
      {/* ============================== setup ============================== */}
      <div className="flex flex-col gap-3">
        <Panel className="space-y-4 p-3">
          <PanelHeader title={t('play.title')} subtitle={t('play.subtitle')} />

          <div>
            <p className="stat-label mb-1.5">{t('play.playAs')}</p>
            <div className="flex gap-1 rounded-xl bg-black/25 p-1">
              {(['white', 'black', 'random'] as ColorChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setColorChoice(choice)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                    colorChoice === choice ? 'bg-white/[0.12] text-white' : 'text-[var(--text-muted)] hover:text-white'
                  }`}
                >
                  {t(`play.${choice}`)}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label={t('play.strength')}
            min={0}
            max={20}
            value={skill}
            onChange={setSkill}
            format={(value) => `${t(strengthKey(value))} · ${value}`}
          />

          <Button variant="primary" className="w-full" onClick={newGame}>
            {started ? t('play.restart') : t('play.start')}
          </Button>

          {started && !gameOver ? (
            <Button
              className="w-full"
              onClick={() => {
                setResigned(true);
                setThinking(false);
              }}
            >
              {t('play.resign')}
            </Button>
          ) : null}

          <Button className="w-full" onClick={analyseGame} disabled={line.moves.length === 0}>
            {t('play.analyse')}
          </Button>
        </Panel>

        <Panel className="p-3">
          <p className="panel-title mb-1">{t('play.status')}</p>
          <p className="text-sm font-semibold text-white">{statusText}</p>
        </Panel>
      </div>

      {/* ============================== board ============================== */}
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            {playerColor === 'w' ? t('play.you') : 'Stockfish'}
            <span className="mx-2 text-[var(--text-muted)]">{t('board.vs')}</span>
            {playerColor === 'w' ? 'Stockfish' : t('play.you')}
          </p>
          <span className="chip">{`${t(strengthKey(skill))} · ${skill}`}</span>
        </div>
        <BoardSurface
          fen={fen}
          orientation={playerColor === 'w' ? 'white' : 'black'}
          theme={theme}
          pieceStyle={settings.pieceStyle}
          onMove={handleMove}
          lastMove={node ? { from: node.from as Square, to: node.to as Square } : null}
          shapes={[]}
          showCoordinates={settings.showCoordinates}
          showLegalMoves={settings.showLegalMoves}
          animationMs={settings.animationMs}
          interactive={started && !gameOver}
        />
      </Panel>

      {/* ============================== moves ============================== */}
      <Panel className="flex max-h-[calc(100vh-8rem)] min-h-[20rem] flex-col overflow-hidden">
        <PanelHeader title={t('moves.title')} subtitle={t('moves.count', { n: line.moves.length })} />
        <MoveList line={line} onSelect={() => {}} showBadges={false} />
      </Panel>
    </div>
  );
}
