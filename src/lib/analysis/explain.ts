import { Chess } from 'chess.js';
import type { Color, MoveClass, MoveNode, PieceSymbol, PositionAnalysis, Score, Square } from '@/types';
import type { Lang } from '@/lib/i18n/translations';
import {
  PIECE_VALUE,
  boardFromFen,
  materialBalance,
  opposite,
  seeCapture,
  squareToIndex,
} from '@/lib/chess/board';
import {
  type Fork,
  type HangingPiece,
  type Pin,
  countKingAttackers,
  findForks,
  findHanging,
  findPins,
} from '@/lib/chess/tactics';
import { formatScore, scoreFor, scoreToCp, winPercentFor } from '@/lib/engine/uci';
import { parseUci } from '@/lib/chess/line';
import { type Phrasebook, type Severity, getPhrasebook } from './phrasebook';

const CENTRAL_SQUARES = new Set<string>(['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5']);

/* ------------------------------------------------------------------ */
/* Structured facts about a candidate move (language-neutral)          */
/* ------------------------------------------------------------------ */

export interface MoveFacts {
  readonly san: string;
  readonly from: Square;
  readonly to: Square;
  readonly piece: PieceSymbol;
  readonly captured: PieceSymbol | null;
  /** Net centipawns won by the capture, per static exchange evaluation. */
  readonly captureGain: number;
  readonly givesCheck: boolean;
  readonly isMate: boolean;
  readonly castles: boolean;
  readonly promotes: PieceSymbol | null;
  readonly forks: readonly Fork[];
  readonly pins: readonly Pin[];
  readonly enemyLoose: readonly HangingPiece[];
  readonly ownLoose: readonly HangingPiece[];
  readonly develops: boolean;
  readonly central: boolean;
  readonly kingAttackersOnEnemy: number;
}

/** Plays `uci` in `fen` and extracts everything the explainer needs. */
export function collectMoveFacts(fen: string, uci: string): MoveFacts | null {
  const parsed = parseUci(uci);
  if (!parsed) return null;

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const boardBefore = boardFromFen(fen);

  let move;
  try {
    move = chess.move(parsed as never);
  } catch {
    return null;
  }
  if (!move) return null;

  const mover = move.color as Color;
  const enemy = opposite(mover);
  const fenAfter = chess.fen();
  const boardAfter = boardFromFen(fenAfter);
  const toIdx = squareToIndex(move.to as Square);

  const captureGain = move.captured ? seeCapture(boardBefore, toIdx, mover) : 0;

  const forks = findForks(boardAfter, mover).filter((fork) => fork.from === move.to);
  const pins = findPins(boardAfter, mover).filter((pin) => pin.from === move.to);

  const homeRank = mover === 'w' ? '1' : '8';
  const develops =
    (move.piece === 'n' || move.piece === 'b') && move.from[1] === homeRank && move.to[1] !== homeRank;

  return {
    san: move.san,
    from: move.from as Square,
    to: move.to as Square,
    piece: move.piece as PieceSymbol,
    captured: (move.captured as PieceSymbol | undefined) ?? null,
    captureGain,
    givesCheck: chess.isCheck(),
    isMate: chess.isCheckmate(),
    castles: move.flags.includes('k') || move.flags.includes('q'),
    promotes: (move.promotion as PieceSymbol | undefined) ?? null,
    forks,
    pins,
    enemyLoose: findHanging(boardAfter, enemy),
    ownLoose: findHanging(boardAfter, mover),
    develops,
    central: CENTRAL_SQUARES.has(move.to),
    kingAttackersOnEnemy: countKingAttackers(boardAfter, enemy),
  };
}

/** A short verb phrase describing what a move accomplishes, in `pb`'s language. */
export function intentPhrase(facts: MoveFacts, pb: Phrasebook): string {
  const parts: string[] = [];

  if (facts.isMate) return pb.intent.mate();
  if (facts.promotes) parts.push(pb.intent.promote(facts.promotes));

  if (facts.captured) {
    if (facts.captureGain >= 100) parts.push(pb.intent.win(facts.captured, facts.to));
    else if (facts.captureGain > 0) parts.push(pb.intent.pickup(facts.to));
    else parts.push(pb.intent.trade(facts.to));
  }

  if (facts.forks.length > 0) parts.push(pb.intent.fork(facts.forks[0]));
  else if (facts.pins.length > 0) parts.push(pb.intent.pin(facts.pins[0]));

  if (facts.castles) parts.push(pb.intent.castle());

  if (parts.length === 0) {
    const bigLoose = facts.enemyLoose.find((entry) => entry.loss >= 300);
    if (bigLoose) parts.push(pb.intent.hitLoose(bigLoose.type, bigLoose.square));
    else if (facts.givesCheck) parts.push(pb.intent.check());
    else if (facts.develops) parts.push(pb.intent.develop(facts.piece, facts.to));
    else if (facts.central) parts.push(pb.intent.center(facts.to));
    else if (facts.kingAttackersOnEnemy >= 3) parts.push(pb.intent.kingPile());
    else parts.push(pb.intent.improve(facts.piece));
  }

  return pb.and(parts.slice(0, 2));
}

/* ------------------------------------------------------------------ */
/* Full explanation                                                    */
/* ------------------------------------------------------------------ */

export interface ExplainInput {
  readonly node: MoveNode;
  readonly before: PositionAnalysis;
  readonly after: PositionAnalysis;
  readonly classification: MoveClass;
  readonly cpLoss: number;
  readonly winDrop: number;
  readonly scoreBefore: Score;
  readonly scoreAfter: Score;
  readonly sacrificedValue: number;
  readonly openingName: string | null;
  readonly legalMoves: number;
}

export interface Explanation {
  readonly text: string;
  readonly details: readonly string[];
  readonly betterMove: string | null;
}

/** Builds the paragraph shown under "Why this move?" plus supporting bullets. */
export function explainMove(input: ExplainInput, lang: Lang = 'en'): Explanation {
  const pb = getPhrasebook(lang);
  const { node, before, after, classification, scoreBefore, scoreAfter, winDrop } = input;
  const mover = node.color;
  const enemy = opposite(mover);
  const us = pb.side(mover);
  const them = pb.side(enemy);

  const playedFacts = collectMoveFacts(node.fenBefore, node.uci);
  const bestUci = before.lines[0]?.pv[0] ?? before.bestMove;
  const bestFacts = bestUci && bestUci !== node.uci ? collectMoveFacts(node.fenBefore, bestUci) : null;
  const betterMove = bestFacts?.san ?? null;

  const replyUci = after.lines[0]?.pv[0] ?? after.bestMove;
  const replyFacts = replyUci ? collectMoveFacts(node.fenAfter, replyUci) : null;

  const details: string[] = [];
  const sentences: string[] = [];

  const evalPhrase = pb.evalMoves(formatScore(scoreBefore), formatScore(scoreAfter));

  /* -------------------- Opening / forced short-circuits -------------------- */

  if (classification === 'book') {
    sentences.push(
      input.openingName ? pb.book.theory(node.san, input.openingName) : pb.book.known(node.san),
    );
    if (playedFacts) sentences.push(pb.book.continues(intentPhrase(playedFacts, pb)));
    details.push(pb.detail.stillBook());
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'forced') {
    sentences.push(pb.forcedOnly(node.san));
    sentences.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  /* -------------------- Positive classifications -------------------- */

  if (classification === 'brilliant' && playedFacts) {
    const sacrificed = pb.pawns(input.sacrificedValue);
    sentences.push(pb.brilliant.lead(node.san, us, sacrificed));
    const pv = before.lines[0]?.san.slice(0, 4).join(' ');
    if (pv) sentences.push(pb.brilliant.point(pv));
    else sentences.push(pb.brilliant.compensation(intentPhrase(playedFacts, pb)));
    details.push(pb.brilliant.dMaterial(sacrificed));
    if (playedFacts.forks.length) details.push(pb.brilliant.dFork(pb.intent.fork(playedFacts.forks[0])));
    if (playedFacts.kingAttackersOnEnemy >= 2) {
      details.push(pb.brilliant.dKing(playedFacts.kingAttackersOnEnemy, pb.sideLower(enemy)));
    }
    details.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'great' && playedFacts) {
    sentences.push(pb.great.lead(node.san));
    const second = before.lines[1];
    if (second?.san[0]) {
      const secondDrop = winPercentFor(before.lines[0].score, mover) - winPercentFor(second.score, mover);
      sentences.push(pb.great.runnerUp(second.san[0], secondDrop.toFixed(0), us));
    }
    sentences.push(pb.great.works(intentPhrase(playedFacts, pb)));
    details.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'best' || classification === 'excellent' || classification === 'good') {
    if (playedFacts) {
      const lead =
        classification === 'best'
          ? pb.positive.leadBest(node.san)
          : classification === 'excellent'
            ? pb.positive.leadExcellent(node.san)
            : pb.positive.leadGood(node.san);
      sentences.push(lead);
      sentences.push(pb.positive.works(intentPhrase(playedFacts, pb)));

      if (betterMove && classification !== 'best') {
        sentences.push(pb.positive.sharper(betterMove, bestFacts ? intentPhrase(bestFacts, pb) : null));
      }

      const balance = materialBalance(boardFromFen(node.fenAfter), mover);
      if (Math.abs(balance) >= 100) {
        details.push(
          balance > 0 ? pb.positive.dUp(us, pb.pawns(balance)) : pb.positive.dDown(us, pb.pawns(balance)),
        );
      }
      if (playedFacts.ownLoose.length > 0) {
        const worst = playedFacts.ownLoose[0];
        details.push(pb.positive.dWatch(pb.pieceOn(worst.type, worst.square), pb.pawns(worst.loss), them));
      }
      details.push(evalPhrase);
    } else {
      sentences.push(pb.positive.steady(node.san));
      details.push(evalPhrase);
    }
    return { text: sentences.join(' '), details, betterMove };
  }

  /* -------------------- Errors -------------------- */

  const severity: Severity =
    classification === 'blunder' ? 'blunder' : classification === 'mistake' ? 'mistake' : 'inaccuracy';

  let reason: string | null = null;

  // 1. Allows forced mate.
  if (scoreAfter.kind === 'mate') {
    const mateForMover = scoreFor(scoreAfter, mover).value > 0;
    if (!mateForMover) {
      reason = pb.reason.allowsMate(replyFacts?.san ?? null, Math.abs(scoreAfter.value));
    }
  }

  // 2. Hangs a piece that the opponent's best reply takes.
  if (!reason && playedFacts) {
    const beforeLoose = new Map(
      findHanging(boardFromFen(node.fenBefore), mover).map((h) => [h.square, h.loss] as const),
    );
    const newlyLoose = playedFacts.ownLoose.filter(
      (entry) => (beforeLoose.get(entry.square) ?? 0) < entry.loss && entry.loss >= 100,
    );
    if (newlyLoose.length > 0) {
      const worst = newlyLoose[0];
      const taker = replyFacts && replyFacts.to === worst.square ? replyFacts.san : null;
      reason = pb.reason.leavesUndefended(pb.pieceOn(worst.type, worst.square), pb.pawns(worst.loss), taker);
      details.push(
        pb.detail.loosePieces(
          pb.and(playedFacts.ownLoose.slice(0, 3).map((h) => pb.pieceOn(h.type, h.square))),
        ),
      );
    }
  }

  // 3. Walks into a tactic.
  if (!reason && replyFacts) {
    if (replyFacts.forks.length > 0) {
      reason = pb.reason.walksIntoFork(replyFacts.san, pb.intent.fork(replyFacts.forks[0]));
    } else if (replyFacts.pins.length > 0) {
      reason = pb.reason.allowsPin(replyFacts.san, pb.intent.pin(replyFacts.pins[0]));
    } else if (replyFacts.captureGain >= 150) {
      reason = pb.reason.simplyWins(them, replyFacts.san, pb.pawns(replyFacts.captureGain));
    } else if (replyFacts.isMate) {
      reason = pb.reason.isMate(replyFacts.san);
    }
  }

  // 4. Missed a concrete opportunity.
  if (!reason && bestFacts) {
    if (bestFacts.captureGain >= 150 || bestFacts.forks.length > 0 || bestFacts.isMate) {
      reason = pb.reason.misses(bestFacts.san, intentPhrase(bestFacts, pb));
    }
  }

  // 5. Generic fallback grounded in the numbers.
  if (!reason) {
    reason = pb.reason.generic(winDrop.toFixed(0), us);
  }

  sentences.push(pb.errorSentence(node.san, severity, reason));

  if (betterMove && bestFacts) {
    sentences.push(pb.prefers(betterMove, intentPhrase(bestFacts, pb)));
  }
  sentences.push(evalPhrase);

  /* -------------------- Supporting bullets -------------------- */

  const bestPv = before.lines[0]?.san.slice(0, 5).join(' ');
  if (bestPv) details.push(pb.detail.bestLine(bestPv));

  if (replyFacts) details.push(pb.detail.strongestReply(them, replyFacts.san));

  const cpSwing = Math.abs(scoreToCp(scoreFor(scoreBefore, mover)) - scoreToCp(scoreFor(scoreAfter, mover)));
  if (cpSwing >= 50) details.push(pb.detail.cpLoss(cpSwing, pb.pawns(cpSwing)));

  const kingPressure = countKingAttackers(boardFromFen(node.fenAfter), mover);
  if (kingPressure >= 3) {
    details.push(pb.detail.kingPressure(kingPressure, pb.sideLower(mover)));
  }

  return { text: sentences.join(' '), details, betterMove };
}

export { PIECE_VALUE };
