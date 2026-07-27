'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Square } from '@/types';
import { fenTurn } from '@/lib/chess/fen';
import { childrenOf, fenOfNode } from '@/lib/chess/tree';
import { getTheme } from '@/lib/theme/boardThemes';
import { playMoveSound, playSound } from '@/lib/sound/sounds';
import {
  type Repertoire,
  type SrsCard,
  getSrsCards,
  reviewCard,
} from '@/lib/repertoire/repertoireDb';
import {
  type RepCard,
  collectCards,
  dueCards,
  duePathNodes,
  fenKeyOf,
  isPreparedReply,
  pickOpponentChild,
  sideOf,
  srsByFenKey,
} from '@/lib/repertoire/trainer';
import { useTranslation } from '@/lib/i18n';
import { useSettings } from '@/store/settingsStore';
import { BoardSurface, type BoardMove } from '@/components/Chessboard';
import { Button, Panel, PanelHeader } from '@/components/ui/Primitives';

type Phase = 'you' | 'opponent' | 'lineDone' | 'empty';

export function RepertoireTrainer({ repertoire, onExit }: { repertoire: Repertoire; onExit(): void }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const theme = useMemo(() => getTheme(settings.boardThemeId), [settings.boardThemeId]);

  const tree = repertoire.tree;
  const yourSide = sideOf(repertoire.color);
  const cards = useMemo(() => collectCards(tree, repertoire.color), [tree, repertoire.color]);

  const [srsMap, setSrsMap] = useState<Map<string, SrsCard>>(new Map());
  const [cursor, setCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('empty');
  const [feedback, setFeedback] = useState<{ kind: 'correct' | 'wrong'; expectedSan?: string } | null>(null);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });

  // Load this repertoire's SRS state once.
  useEffect(() => {
    let cancelled = false;
    getSrsCards(repertoire.id)
      .then((byId) => {
        if (!cancelled) setSrsMap(srsByFenKey(repertoire.id, byId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repertoire.id]);

  const due = useMemo(() => dueCards(cards, srsMap), [cards, srsMap]);
  const towardDue = useMemo(() => duePathNodes(tree, due), [tree, due]);

  const playCue = useCallback(
    (nodeId: string) => {
      if (!settings.soundEnabled) return;
      playMoveSound(tree.nodes[nodeId].move, { volume: settings.soundVolume });
    },
    [tree, settings.soundEnabled, settings.soundVolume],
  );

  const startLine = useCallback(() => {
    setFeedback(null);
    setCursor(null);
    if (tree.rootChildren.length === 0) {
      setPhase('empty');
      return;
    }
    setPhase(fenTurn(tree.startFen) === yourSide ? 'you' : 'opponent');
  }, [tree, yourSide]);

  // Start the first line once the tree is known.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startLine();
  }, [startLine]);

  // The opponent replies automatically after a short beat.
  useEffect(() => {
    if (phase !== 'opponent') return undefined;
    const timer = setTimeout(() => {
      const childId = pickOpponentChild(tree, cursor, towardDue);
      if (!childId) {
        setPhase('lineDone');
        return;
      }
      playCue(childId);
      setCursor(childId);
      setPhase(childrenOf(tree, childId).length > 0 ? 'you' : 'lineDone');
    }, 500);
    return () => clearTimeout(timer);
  }, [phase, cursor, tree, towardDue, playCue]);

  const onYourMove = useCallback(
    (move: BoardMove): boolean => {
      if (phase !== 'you') return false;
      const options = childrenOf(tree, cursor);
      const expected = options.map((id) => tree.nodes[id].move.uci);
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const correct = isPreparedReply(expected, uci);

      // Only respond to a move that is at least prepared or the played piece is legal-ish;
      // an entirely unrelated move still counts as a (wrong) attempt.
      const fen = fenOfNode(tree, cursor);
      const fenKey = fenKeyOf(fen);
      const previous = srsMap.get(fenKey);
      void reviewCard(repertoire.id, fenKey, fen, correct, previous).then((card) =>
        setSrsMap((map) => new Map(map).set(fenKey, card)),
      );

      const chosenId = correct ? options.find((id) => tree.nodes[id].move.uci === uci)! : options[0];
      const chosen = tree.nodes[chosenId].move;

      setSession((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
      setFeedback(correct ? { kind: 'correct' } : { kind: 'wrong', expectedSan: chosen.san });

      if (settings.soundEnabled) {
        if (correct) playMoveSound(chosen, { volume: settings.soundVolume });
        else playSound('blunder', settings.soundVolume);
      }

      setCursor(chosenId);
      setPhase(childrenOf(tree, chosenId).length > 0 ? 'opponent' : 'lineDone');
      return correct;
    },
    [phase, tree, cursor, srsMap, repertoire.id, settings.soundEnabled, settings.soundVolume],
  );

  const fen = fenOfNode(tree, cursor);
  const lastNode = cursor ? tree.nodes[cursor]?.move : null;
  const total = session.correct + session.wrong;
  const accuracy = total > 0 ? Math.round((session.correct / total) * 100) : 100;

  const statusText = (() => {
    if (phase === 'empty') return t('rep.trainEmpty');
    if (phase === 'opponent') return t('rep.opponentMoving');
    if (phase === 'lineDone') return t('rep.lineComplete');
    return t('rep.yourMove');
  })();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{repertoire.name}</p>
          <Button onClick={onExit}>{t('rep.exitTraining')}</Button>
        </div>
        <BoardSurface
          fen={fen}
          orientation={repertoire.color}
          theme={theme}
          pieceStyle={settings.pieceStyle}
          onMove={onYourMove}
          lastMove={lastNode ? { from: lastNode.from as Square, to: lastNode.to as Square } : null}
          shapes={[]}
          showCoordinates={settings.showCoordinates}
          showLegalMoves={settings.showLegalMoves}
          animationMs={settings.animationMs}
          interactive={phase === 'you'}
        />
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel className="p-3">
          <PanelHeader title={t('rep.training')} subtitle={statusText} />
          <div className="mt-3 space-y-3">
            {feedback ? (
              <div
                className="rounded-lg px-3 py-2 text-sm font-semibold"
                style={{
                  background: feedback.kind === 'correct' ? 'rgba(127,206,107,0.14)' : 'rgba(229,72,77,0.14)',
                  color: feedback.kind === 'correct' ? '#7fce6b' : '#ffb4b6',
                }}
              >
                {feedback.kind === 'correct'
                  ? t('rep.correct')
                  : t('rep.wrong', { move: feedback.expectedSan ?? '' })}
              </div>
            ) : null}

            {phase === 'lineDone' || phase === 'empty' ? (
              <Button variant="primary" className="w-full" onClick={startLine} disabled={phase === 'empty'}>
                {t('rep.newLine')}
              </Button>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-black/20 px-2 py-2">
                <p className="font-mono text-lg font-bold text-[#7fce6b]">{session.correct}</p>
                <p className="stat-label">{t('rep.correctCount')}</p>
              </div>
              <div className="rounded-lg bg-black/20 px-2 py-2">
                <p className="font-mono text-lg font-bold text-[#e5484d]">{session.wrong}</p>
                <p className="stat-label">{t('rep.wrongCount')}</p>
              </div>
              <div className="rounded-lg bg-black/20 px-2 py-2">
                <p className="font-mono text-lg font-bold text-white">{accuracy}%</p>
                <p className="stat-label">{t('rep.accuracy')}</p>
              </div>
            </div>

            <p className="text-center text-[0.68rem] text-[var(--text-muted)]">
              {t('rep.dueRemaining', { n: due.length, total: cards.length })}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
