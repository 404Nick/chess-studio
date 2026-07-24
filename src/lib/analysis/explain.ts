import { Chess } from 'chess.js';
import type { Color, MoveClass, MoveNode, PieceSymbol, PositionAnalysis, Score, Square } from '@/types';
import {
  PIECE_NAME,
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
  listPhrase,
} from '@/lib/chess/tactics';
import { formatScore, scoreFor, scoreToCp, winPercentFor } from '@/lib/engine/uci';
import { parseUci } from '@/lib/chess/line';

const CENTRAL_SQUARES = new Set<string>(['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5']);

export function sideName(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

function pawns(cp: number): string {
  const value = Math.abs(cp) / 100;
  if (value >= 10) return `${value.toFixed(0)} pawns`;
  if (Math.abs(value - 1) < 0.001) return '1 pawn';
  return `${value.toFixed(1)} pawns`;
}

function article(type: PieceSymbol): string {
  return `the ${PIECE_NAME[type]}`;
}

/* ------------------------------------------------------------------ */
/* Structured facts about a candidate move                             */
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
  /** Forks created by the piece that just moved. */
  readonly forks: readonly Fork[];
  /** Pins created by the piece that just moved. */
  readonly pins: readonly Pin[];
  /** Enemy pieces left loose after the move. */
  readonly enemyLoose: readonly HangingPiece[];
  /** Own pieces left loose after the move. */
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

function forkPhrase(fork: Fork): string {
  const names = fork.targets.map((t) => (t.type === 'k' ? 'the king' : `${article(t.type)} on ${t.square}`));
  return `forking ${listPhrase(names)}`;
}

function pinPhrase(pin: Pin): string {
  return pin.absolute
    ? `pinning ${article(pin.pinnedType)} on ${pin.pinned} against the king`
    : `pinning ${article(pin.pinnedType)} on ${pin.pinned} to ${article(pin.behindType)} on ${pin.behind}`;
}

/** A short verb phrase describing what a move accomplishes. */
export function intentPhrase(facts: MoveFacts): string {
  const parts: string[] = [];

  if (facts.isMate) return 'delivering checkmate';
  if (facts.promotes) parts.push(`promoting to a ${PIECE_NAME[facts.promotes]}`);

  if (facts.captured) {
    if (facts.captureGain >= 100) parts.push(`winning ${article(facts.captured)} on ${facts.to}`);
    else if (facts.captureGain > 0) parts.push(`picking up material on ${facts.to}`);
    else parts.push(`trading on ${facts.to}`);
  }

  if (facts.forks.length > 0) parts.push(forkPhrase(facts.forks[0]));
  else if (facts.pins.length > 0) parts.push(pinPhrase(facts.pins[0]));

  if (facts.castles) parts.push('castling the king into safety');

  if (parts.length === 0) {
    const bigLoose = facts.enemyLoose.find((entry) => entry.loss >= 300);
    if (bigLoose) parts.push(`hitting the loose ${PIECE_NAME[bigLoose.type]} on ${bigLoose.square}`);
    else if (facts.givesCheck) parts.push('checking the king');
    else if (facts.develops) parts.push(`developing ${article(facts.piece)} to ${facts.to}`);
    else if (facts.central) parts.push(`taking the centre with ${facts.to}`);
    else if (facts.kingAttackersOnEnemy >= 3) parts.push('piling more pieces onto the enemy king');
    else parts.push(`improving ${article(facts.piece)}`);
  }

  if (facts.givesCheck && !parts.some((p) => p.includes('check'))) parts.unshift('checking the king');

  return listPhrase(parts.slice(0, 2));
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
export function explainMove(input: ExplainInput): Explanation {
  const { node, before, after, classification, scoreBefore, scoreAfter, winDrop } = input;
  const mover = node.color;
  const enemy = opposite(mover);
  const us = sideName(mover);
  const them = sideName(enemy);

  const playedFacts = collectMoveFacts(node.fenBefore, node.uci);
  const bestUci = before.lines[0]?.pv[0] ?? before.bestMove;
  const bestFacts = bestUci && bestUci !== node.uci ? collectMoveFacts(node.fenBefore, bestUci) : null;
  const betterMove = bestFacts?.san ?? null;

  const replyUci = after.lines[0]?.pv[0] ?? after.bestMove;
  const replyFacts = replyUci ? collectMoveFacts(node.fenAfter, replyUci) : null;

  const details: string[] = [];
  const sentences: string[] = [];

  const evalPhrase = `The evaluation moves from ${formatScore(scoreBefore)} to ${formatScore(scoreAfter)}.`;

  /* -------------------- Opening / forced short-circuits -------------------- */

  if (classification === 'book') {
    sentences.push(
      input.openingName
        ? `${node.san} is main-line theory — this is the ${input.openingName}.`
        : `${node.san} is a well-known book move.`,
    );
    if (playedFacts) sentences.push(`It continues development by ${intentPhrase(playedFacts)}.`);
    details.push('Still inside the opening book, so no engine judgement is applied.');
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'forced') {
    sentences.push(`${node.san} was the only legal move in the position.`);
    sentences.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  /* -------------------- Positive classifications -------------------- */

  if (classification === 'brilliant' && playedFacts) {
    const sacrificed = pawns(input.sacrificedValue);
    sentences.push(
      `${node.san} is brilliant: ${us} gives up ${sacrificed} of material and the position only gets better.`,
    );
    const pv = before.lines[0]?.san.slice(0, 4).join(' ');
    if (pv) sentences.push(`The point is the follow-up ${pv}.`);
    else sentences.push(`The compensation is ${intentPhrase(playedFacts)}.`);
    details.push(`Material offered: ${sacrificed} (static exchange evaluation).`);
    if (playedFacts.forks.length) details.push(`Creates a fork: ${forkPhrase(playedFacts.forks[0])}.`);
    if (playedFacts.kingAttackersOnEnemy >= 2) {
      details.push(`${playedFacts.kingAttackersOnEnemy} pieces are now aimed at the ${them.toLowerCase()} king.`);
    }
    details.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'great' && playedFacts) {
    sentences.push(`${node.san} is the only move that holds everything together.`);
    const second = before.lines[1];
    if (second?.san[0]) {
      const secondDrop = winPercentFor(before.lines[0].score, mover) - winPercentFor(second.score, mover);
      sentences.push(
        `The runner-up ${second.san[0]} would have given away ${secondDrop.toFixed(0)}% of ${us}'s winning chances.`,
      );
    }
    sentences.push(`It works by ${intentPhrase(playedFacts)}.`);
    details.push(evalPhrase);
    return { text: sentences.join(' '), details, betterMove: null };
  }

  if (classification === 'best' || classification === 'excellent' || classification === 'good') {
    if (playedFacts) {
      const lead =
        classification === 'best'
          ? `${node.san} is the engine's top choice.`
          : classification === 'excellent'
            ? `${node.san} is essentially as good as the top move.`
            : `${node.san} is a solid, playable move.`;
      sentences.push(lead);
      sentences.push(`It works by ${intentPhrase(playedFacts)}.`);

      if (betterMove && classification !== 'best') {
        sentences.push(`${betterMove} was marginally sharper${bestFacts ? `, ${intentPhrase(bestFacts)}` : ''}.`);
      }

      const balance = materialBalance(boardFromFen(node.fenAfter), mover);
      if (Math.abs(balance) >= 100) {
        details.push(
          balance > 0
            ? `${us} is up ${pawns(balance)} of material.`
            : `${us} is down ${pawns(balance)} of material.`,
        );
      }
      if (playedFacts.ownLoose.length > 0) {
        const worst = playedFacts.ownLoose[0];
        details.push(
          `Watch ${article(worst.type)} on ${worst.square} — it is currently worth ${pawns(worst.loss)} to ${them}.`,
        );
      }
      details.push(evalPhrase);
    } else {
      sentences.push(`${node.san} keeps the evaluation steady.`);
      details.push(evalPhrase);
    }
    return { text: sentences.join(' '), details, betterMove };
  }

  /* -------------------- Errors -------------------- */

  const severity =
    classification === 'blunder' ? 'a blunder' : classification === 'mistake' ? 'a mistake' : 'an inaccuracy';

  const reasons: string[] = [];

  // 1. Allows forced mate.
  if (scoreAfter.kind === 'mate') {
    const mateForMover = scoreFor(scoreAfter, mover).value > 0;
    if (!mateForMover) {
      reasons.push(
        `it allows a forced mate${replyFacts ? ` beginning with ${replyFacts.san}` : ''} in ${Math.abs(
          scoreAfter.value,
        )} moves`,
      );
    }
  }

  // 2. Hangs a piece that the opponent's best reply takes.
  if (reasons.length === 0 && playedFacts) {
    const beforeLoose = new Map(
      findHanging(boardFromFen(node.fenBefore), mover).map((h) => [h.square, h.loss] as const),
    );
    const newlyLoose = playedFacts.ownLoose.filter(
      (entry) => (beforeLoose.get(entry.square) ?? 0) < entry.loss && entry.loss >= 100,
    );
    if (newlyLoose.length > 0) {
      const worst = newlyLoose[0];
      const taker = replyFacts && replyFacts.to === worst.square ? ` — ${replyFacts.san} wins it on the spot` : '';
      reasons.push(
        `it leaves ${article(worst.type)} on ${worst.square} undefended, costing ${pawns(worst.loss)}${taker}`,
      );
      details.push(
        `Loose pieces after ${node.san}: ${listPhrase(
          playedFacts.ownLoose.slice(0, 3).map((h) => `${PIECE_NAME[h.type]} on ${h.square}`),
        )}.`,
      );
    }
  }

  // 3. Walks into a tactic.
  if (reasons.length === 0 && replyFacts) {
    if (replyFacts.forks.length > 0) {
      reasons.push(`it walks into ${replyFacts.san}, ${forkPhrase(replyFacts.forks[0])}`);
    } else if (replyFacts.pins.length > 0) {
      reasons.push(`it allows ${replyFacts.san}, ${pinPhrase(replyFacts.pins[0])}`);
    } else if (replyFacts.captureGain >= 150) {
      reasons.push(`${them} simply plays ${replyFacts.san} and wins ${pawns(replyFacts.captureGain)}`);
    } else if (replyFacts.isMate) {
      reasons.push(`${replyFacts.san} is mate`);
    }
  }

  // 4. Missed a concrete opportunity.
  if (reasons.length === 0 && bestFacts) {
    if (bestFacts.captureGain >= 150 || bestFacts.forks.length > 0 || bestFacts.isMate) {
      reasons.push(`it misses ${bestFacts.san}, ${intentPhrase(bestFacts)}`);
    }
  }

  // 5. Generic fallback grounded in the numbers.
  if (reasons.length === 0) {
    reasons.push(
      `it hands over ${winDrop.toFixed(0)}% of ${us}'s winning chances without a concrete tactical justification`,
    );
  }

  sentences.push(`${node.san} is ${severity} because ${reasons[0]}.`);

  if (betterMove && bestFacts) {
    sentences.push(`The engine prefers ${betterMove}, ${intentPhrase(bestFacts)}.`);
  }
  sentences.push(evalPhrase);

  /* -------------------- Supporting bullets -------------------- */

  const bestPv = before.lines[0]?.san.slice(0, 5).join(' ');
  if (bestPv) details.push(`Best line: ${bestPv}`);

  if (replyFacts) details.push(`${them}'s strongest reply is ${replyFacts.san}.`);

  const cpSwing = Math.abs(scoreToCp(scoreFor(scoreBefore, mover)) - scoreToCp(scoreFor(scoreAfter, mover)));
  if (cpSwing >= 50) details.push(`Centipawn loss: ${cpSwing} (${pawns(cpSwing)}).`);

  const kingPressure = countKingAttackers(boardFromFen(node.fenAfter), mover);
  if (kingPressure >= 3) {
    details.push(`${kingPressure} enemy pieces are now attacking the squares around the ${us.toLowerCase()} king.`);
  }

  return { text: sentences.join(' '), details, betterMove };
}

/** One-line summary used in compact UI spots. */
export function shortSummary(node: MoveNode): string {
  if (!node.assessment) return '';
  const { assessment } = node;
  if (assessment.betterMove && assessment.cpLoss > 50) {
    return `${node.san} loses ${(assessment.cpLoss / 100).toFixed(1)} pawns — ${assessment.betterMove} was better.`;
  }
  return assessment.explanation.split('. ')[0] ?? '';
}

export { PIECE_VALUE };
