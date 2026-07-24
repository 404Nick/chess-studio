import type { Color, PieceSymbol, Square } from '@/types';
import type { Lang } from '@/lib/i18n/translations';
import type { Fork, Pin } from '@/lib/chess/tactics';

/**
 * Natural-language phrase builders for the move explanations, one implementation per
 * language. Keeping all sentence construction here means Russian grammar (piece cases,
 * pawn plurals, word order) stays correct without littering `explain.ts` with ternaries.
 */

export type Severity = 'blunder' | 'mistake' | 'inaccuracy';

export interface Phrasebook {
  side(color: Color): string;
  /** Lowercase side, for mid-sentence use ("the white king"). */
  sideLower(color: Color): string;
  /** e.g. "3.2 pawns" / "3.2 пешки" */
  pawns(cp: number): string;
  /** "the knight on f3" / "коня на f3" (accusative) or nominative — see methods. */
  pieceOn(type: PieceSymbol, sq: Square): string;
  and(items: readonly string[]): string;

  /* intent (verb) phrases */
  intent: {
    mate(): string;
    promote(type: PieceSymbol): string;
    win(type: PieceSymbol, sq: Square): string;
    pickup(sq: Square): string;
    trade(sq: Square): string;
    fork(fork: Fork): string;
    pin(pin: Pin): string;
    castle(): string;
    hitLoose(type: PieceSymbol, sq: Square): string;
    check(): string;
    develop(type: PieceSymbol, sq: Square): string;
    center(sq: Square): string;
    kingPile(): string;
    improve(type: PieceSymbol): string;
  };

  evalMoves(before: string, after: string): string;

  book: {
    theory(san: string, opening: string): string;
    known(san: string): string;
    continues(intent: string): string;
    detail(): string;
  };
  forcedOnly(san: string): string;

  brilliant: {
    lead(san: string, side: string, sacrificed: string): string;
    point(pv: string): string;
    compensation(intent: string): string;
    dMaterial(sacrificed: string): string;
    dFork(fork: string): string;
    dKing(n: number, themLower: string): string;
  };
  great: {
    lead(san: string): string;
    runnerUp(move: string, pct: string, side: string): string;
    works(intent: string): string;
  };
  positive: {
    leadBest(san: string): string;
    leadExcellent(san: string): string;
    leadGood(san: string): string;
    works(intent: string): string;
    sharper(better: string, intent: string | null): string;
    dUp(side: string, pawns: string): string;
    dDown(side: string, pawns: string): string;
    dWatch(pieceOn: string, pawns: string, them: string): string;
    steady(san: string): string;
  };

  errorSentence(san: string, severity: Severity, reason: string): string;
  reason: {
    allowsMate(startSan: string | null, moves: number): string;
    leavesUndefended(pieceOn: string, pawns: string, takerSan: string | null): string;
    walksIntoFork(san: string, fork: string): string;
    allowsPin(san: string, pin: string): string;
    simplyWins(them: string, san: string, pawns: string): string;
    isMate(san: string): string;
    misses(san: string, intent: string): string;
    generic(pct: string, side: string): string;
  };
  prefers(better: string, intent: string): string;

  detail: {
    stillBook(): string;
    loosePieces(list: string): string;
    bestLine(pv: string): string;
    strongestReply(them: string, san: string): string;
    cpLoss(cp: number, pawns: string): string;
    kingPressure(n: number, sideLower: string): string;
  };
}

/* ------------------------------------------------------------------ */
/* Piece word forms                                                    */
/* ------------------------------------------------------------------ */

const EN_PIECE: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Russian nominative / accusative forms. */
const RU_PIECE: Record<PieceSymbol, { nom: string; acc: string }> = {
  p: { nom: 'пешка', acc: 'пешку' },
  n: { nom: 'конь', acc: 'коня' },
  b: { nom: 'слон', acc: 'слона' },
  r: { nom: 'ладья', acc: 'ладью' },
  q: { nom: 'ферзь', acc: 'ферзя' },
  k: { nom: 'король', acc: 'короля' },
};

function ruPawns(cp: number): string {
  const value = Math.abs(cp) / 100;
  // Non-integers read naturally with the "genitive singular" form ("пешки").
  if (Math.abs(value - Math.round(value)) > 0.001) return `${value.toFixed(1)} пешки`;
  const n = Math.round(value);
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word = 'пешек';
  if (mod10 === 1 && mod100 !== 11) word = 'пешка';
  else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) word = 'пешки';
  return `${n} ${word}`;
}

function enPawns(cp: number): string {
  const value = Math.abs(cp) / 100;
  if (value >= 10) return `${value.toFixed(0)} pawns`;
  if (Math.abs(value - 1) < 0.001) return '1 pawn';
  return `${value.toFixed(1)} pawns`;
}

/* ------------------------------------------------------------------ */
/* English                                                             */
/* ------------------------------------------------------------------ */

function forkTargetsEn(fork: Fork): string {
  return fork.targets.map((t) => (t.type === 'k' ? 'the king' : `the ${EN_PIECE[t.type]} on ${t.square}`)).join(' and ');
}

const en: Phrasebook = {
  side: (c) => (c === 'w' ? 'White' : 'Black'),
  sideLower: (c) => (c === 'w' ? 'white' : 'black'),
  pawns: enPawns,
  pieceOn: (type, sq) => `the ${EN_PIECE[type]} on ${sq}`,
  and: (items) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`,
  intent: {
    mate: () => 'delivering checkmate',
    promote: (t) => `promoting to a ${EN_PIECE[t]}`,
    win: (t, sq) => `winning the ${EN_PIECE[t]} on ${sq}`,
    pickup: (sq) => `picking up material on ${sq}`,
    trade: (sq) => `trading on ${sq}`,
    fork: (f) => `forking ${forkTargetsEn(f)}`,
    pin: (p) =>
      p.absolute
        ? `pinning the ${EN_PIECE[p.pinnedType]} on ${p.pinned} against the king`
        : `pinning the ${EN_PIECE[p.pinnedType]} on ${p.pinned} to the ${EN_PIECE[p.behindType]} on ${p.behind}`,
    castle: () => 'castling the king into safety',
    hitLoose: (t, sq) => `hitting the loose ${EN_PIECE[t]} on ${sq}`,
    check: () => 'checking the king',
    develop: (t, sq) => `developing the ${EN_PIECE[t]} to ${sq}`,
    center: (sq) => `taking the centre with ${sq}`,
    kingPile: () => 'piling more pieces onto the enemy king',
    improve: (t) => `improving the ${EN_PIECE[t]}`,
  },
  evalMoves: (b, a) => `The evaluation moves from ${b} to ${a}.`,
  book: {
    theory: (san, opening) => `${san} is main-line theory — this is the ${opening}.`,
    known: (san) => `${san} is a well-known book move.`,
    continues: (intent) => `It continues development by ${intent}.`,
    detail: () => 'Still inside the opening book, so no engine judgement is applied.',
  },
  forcedOnly: (san) => `${san} was the only legal move in the position.`,
  brilliant: {
    lead: (san, side, sac) =>
      `${san} is brilliant: ${side} gives up ${sac} of material and the position only gets better.`,
    point: (pv) => `The point is the follow-up ${pv}.`,
    compensation: (intent) => `The compensation is ${intent}.`,
    dMaterial: (sac) => `Material offered: ${sac} (static exchange evaluation).`,
    dFork: (fork) => `Creates a fork: ${fork}.`,
    dKing: (n, them) => `${n} pieces are now aimed at the ${them} king.`,
  },
  great: {
    lead: (san) => `${san} is the only move that holds everything together.`,
    runnerUp: (move, pct, side) =>
      `The runner-up ${move} would have given away ${pct}% of ${side}'s winning chances.`,
    works: (intent) => `It works by ${intent}.`,
  },
  positive: {
    leadBest: (san) => `${san} is the engine's top choice.`,
    leadExcellent: (san) => `${san} is essentially as good as the top move.`,
    leadGood: (san) => `${san} is a solid, playable move.`,
    works: (intent) => `It works by ${intent}.`,
    sharper: (better, intent) => `${better} was marginally sharper${intent ? `, ${intent}` : ''}.`,
    dUp: (side, pawns) => `${side} is up ${pawns} of material.`,
    dDown: (side, pawns) => `${side} is down ${pawns} of material.`,
    dWatch: (pieceOn, pawns, them) => `Watch ${pieceOn} — it is currently worth ${pawns} to ${them}.`,
    steady: (san) => `${san} keeps the evaluation steady.`,
  },
  errorSentence: (san, sev, reason) => {
    const word = sev === 'blunder' ? 'a blunder' : sev === 'mistake' ? 'a mistake' : 'an inaccuracy';
    return `${san} is ${word} because ${reason}.`;
  },
  reason: {
    allowsMate: (start, moves) =>
      `it allows a forced mate${start ? ` beginning with ${start}` : ''} in ${moves} moves`,
    leavesUndefended: (pieceOn, pawns, taker) =>
      `it leaves ${pieceOn} undefended, costing ${pawns}${taker ? ` — ${taker} wins it on the spot` : ''}`,
    walksIntoFork: (san, fork) => `it walks into ${san}, ${fork}`,
    allowsPin: (san, pin) => `it allows ${san}, ${pin}`,
    simplyWins: (them, san, pawns) => `${them} simply plays ${san} and wins ${pawns}`,
    isMate: (san) => `${san} is mate`,
    misses: (san, intent) => `it misses ${san}, ${intent}`,
    generic: (pct, side) =>
      `it hands over ${pct}% of ${side}'s winning chances without a concrete tactical justification`,
  },
  prefers: (better, intent) => `The engine prefers ${better}, ${intent}.`,
  detail: {
    stillBook: () => 'Still inside the opening book, so no engine judgement is applied.',
    loosePieces: (list) => `Loose pieces: ${list}.`,
    bestLine: (pv) => `Best line: ${pv}`,
    strongestReply: (them, san) => `${them}'s strongest reply is ${san}.`,
    cpLoss: (cp, pawns) => `Centipawn loss: ${cp} (${pawns}).`,
    kingPressure: (n, side) => `${n} enemy pieces are now attacking the squares around the ${side} king.`,
  },
};

/* ------------------------------------------------------------------ */
/* Russian                                                             */
/* ------------------------------------------------------------------ */

const ruNom = (t: PieceSymbol) => RU_PIECE[t].nom;
const ruAcc = (t: PieceSymbol) => RU_PIECE[t].acc;

function forkTargetsRu(fork: Fork): string {
  return fork.targets
    .map((t) => (t.type === 'k' ? 'короля' : `${ruAcc(t.type)} на ${t.square}`))
    .join(' и ');
}

const ru: Phrasebook = {
  side: (c) => (c === 'w' ? 'белые' : 'чёрные'),
  sideLower: (c) => (c === 'w' ? 'белых' : 'чёрных'),
  pawns: ruPawns,
  pieceOn: (type, sq) => `${ruNom(type)} на ${sq}`,
  and: (items) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`,
  intent: {
    mate: () => 'ставя мат',
    promote: (t) => `превращая пешку в ${ruAcc(t)}`,
    win: (t, sq) => `выигрывая ${ruAcc(t)} на ${sq}`,
    pickup: (sq) => `забирая материал на ${sq}`,
    trade: (sq) => `разменивая на ${sq}`,
    fork: (f) => `создавая вилку на ${forkTargetsRu(f)}`,
    pin: (p) =>
      p.absolute
        ? `связывая ${ruAcc(p.pinnedType)} на ${p.pinned} по линии короля`
        : `связывая ${ruAcc(p.pinnedType)} на ${p.pinned} с ${ruAcc(p.behindType)} на ${p.behind}`,
    castle: () => 'уводя короля в безопасность рокировкой',
    hitLoose: (t, sq) => `нападая на незащищённого ${ruAcc(t)} на ${sq}`,
    check: () => 'объявляя шах',
    develop: (t, sq) => `развивая ${ruAcc(t)} на ${sq}`,
    center: (sq) => `занимая центр ходом ${sq}`,
    kingPile: () => 'усиливая атаку на короля соперника',
    improve: (t) => `улучшая позицию своего ${ruAcc(t)}`,
  },
  evalMoves: (b, a) => `Оценка меняется с ${b} на ${a}.`,
  book: {
    theory: (san, opening) => `${san} — это теория, известная как «${opening}».`,
    known: (san) => `${san} — известный книжный ход.`,
    continues: (intent) => `Продолжает развитие, ${intent}.`,
    detail: () => 'Ход ещё в дебютной книге, поэтому оценка движка не применяется.',
  },
  forcedOnly: (san) => `${san} — единственный возможный ход в этой позиции.`,
  brilliant: {
    lead: (san, side, sac) =>
      `${san} — блестящий ход: ${side} отдают ${sac} материала, а позиция только улучшается.`,
    point: (pv) => `Смысл в продолжении ${pv}.`,
    compensation: (intent) => `Компенсация — ${intent}.`,
    dMaterial: (sac) => `Отдано материала: ${sac} (по статическому размену).`,
    dFork: (fork) => `Создаёт вилку: ${fork}.`,
    dKing: (n, them) => `${n} фигур(ы) теперь нацелены на короля соперника (${them}).`,
  },
  great: {
    lead: (san) => `${san} — единственный ход, удерживающий позицию.`,
    runnerUp: (move, pct, side) =>
      `Второй по силе ход ${move} отдал бы ${pct}% шансов ${side} на победу.`,
    works: (intent) => `Он работает, ${intent}.`,
  },
  positive: {
    leadBest: (san) => `${san} — лучший ход по мнению движка.`,
    leadExcellent: (san) => `${san} практически не уступает лучшему ходу.`,
    leadGood: (san) => `${san} — надёжный, добротный ход.`,
    works: (intent) => `Он работает, ${intent}.`,
    sharper: (better, intent) => `${better} было чуть острее${intent ? `, ${intent}` : ''}.`,
    dUp: (side, pawns) => `${side} впереди на ${pawns} материала.`,
    dDown: (side, pawns) => `${side} отстают на ${pawns} материала.`,
    dWatch: (pieceOn, pawns, them) => `Обратите внимание: ${pieceOn} сейчас стоит ${pawns} для соперника (${them}).`,
    steady: (san) => `${san} сохраняет оценку без изменений.`,
  },
  errorSentence: (san, sev, reason) => {
    const word = sev === 'blunder' ? 'зевок' : sev === 'mistake' ? 'ошибка' : 'неточность';
    return `${san} — это ${word}, потому что ${reason}.`;
  },
  reason: {
    allowsMate: (start, moves) =>
      `допускает форсированный мат${start ? ` начиная с ${start}` : ''} в ${moves} ход(ов)`,
    leavesUndefended: (pieceOn, pawns, taker) =>
      `оставляет без защиты ${pieceOn}, теряя ${pawns}${taker ? ` — ${taker} сразу выигрывает` : ''}`,
    walksIntoFork: (san, fork) => `попадает под ${san}, ${fork}`,
    allowsPin: (san, pin) => `допускает ${san}, ${pin}`,
    simplyWins: (them, san, pawns) => `${them} просто играют ${san} и выигрывают ${pawns}`,
    isMate: (san) => `${san} — мат`,
    misses: (san, intent) => `упускает ${san}, ${intent}`,
    generic: (pct, side) =>
      `отдаёт ${pct}% шансов ${side} на победу без конкретного тактического обоснования`,
  },
  prefers: (better, intent) => `Движок предпочитает ${better}, ${intent}.`,
  detail: {
    stillBook: () => 'Ход ещё в дебютной книге, поэтому оценка движка не применяется.',
    loosePieces: (list) => `Незащищённые фигуры: ${list}.`,
    bestLine: (pv) => `Лучшая линия: ${pv}`,
    strongestReply: (them, san) => `Сильнейший ответ соперника (${them}) — ${san}.`,
    cpLoss: (cp, pawns) => `Потеря в сантипешках: ${cp} (${pawns}).`,
    kingPressure: (n, side) => `${n} фигур соперника атакуют поля вокруг короля (${side}).`,
  },
};

const PHRASEBOOKS: Record<Lang, Phrasebook> = { en, ru };

export function getPhrasebook(lang: Lang): Phrasebook {
  return PHRASEBOOKS[lang] ?? en;
}
