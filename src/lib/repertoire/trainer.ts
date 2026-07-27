import type { GameTree } from '@/types';
import { fenTurn } from '@/lib/chess/fen';
import { childrenOf, pathToNode } from '@/lib/chess/tree';
import { type SrsCard, srsCardId } from './repertoireDb';
import type { RepertoireColor } from './repertoireDb';

/** The position-identity portion of a FEN (placement + turn + castling + en passant). */
export function fenKeyOf(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

export function sideOf(color: RepertoireColor): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b';
}

/** A position where it is your turn and the repertoire has at least one prepared move. */
export interface RepCard {
  /** Node whose children are your prepared moves (null = the start position). */
  readonly parentId: string | null;
  readonly fen: string;
  readonly fenKey: string;
  /** UCI of every prepared reply at this position. */
  readonly expected: readonly string[];
}

/** Every trainable position (your move) in the repertoire. */
export function collectCards(tree: GameTree, color: RepertoireColor): RepCard[] {
  const side = sideOf(color);
  const cards: RepCard[] = [];

  if (fenTurn(tree.startFen) === side && tree.rootChildren.length > 0) {
    cards.push({
      parentId: null,
      fen: tree.startFen,
      fenKey: fenKeyOf(tree.startFen),
      expected: tree.rootChildren.map((id) => tree.nodes[id].move.uci),
    });
  }

  for (const [id, node] of Object.entries(tree.nodes)) {
    const sideAfter = node.move.color === 'w' ? 'b' : 'w';
    if (sideAfter === side && node.children.length > 0) {
      cards.push({
        parentId: id,
        fen: node.move.fenAfter,
        fenKey: fenKeyOf(node.move.fenAfter),
        expected: node.children.map((childId) => tree.nodes[childId].move.uci),
      });
    }
  }

  return cards;
}

function isDue(card: RepCard, srsByFenKey: Map<string, SrsCard>, now: number): boolean {
  const srs = srsByFenKey.get(card.fenKey);
  return !srs || srs.due <= now;
}

export function dueCards(cards: readonly RepCard[], srsByFenKey: Map<string, SrsCard>, now = Date.now()): RepCard[] {
  return cards.filter((card) => isDue(card, srsByFenKey, now));
}

/** Re-keys the id-keyed SRS map from {@link getSrsCards} by fen-key for the trainer. */
export function srsByFenKey(repertoireId: string, byId: Map<string, SrsCard>): Map<string, SrsCard> {
  const out = new Map<string, SrsCard>();
  for (const card of byId.values()) {
    // id === `${repertoireId}::${fenKey}`
    out.set(card.id.slice(repertoireId.length + 2), card);
  }
  return out;
}

/**
 * Node ids that lie on a path from the root toward a *due* card — used to steer the
 * opponent's moves during training so weak lines come up more often.
 */
export function duePathNodes(tree: GameTree, due: readonly RepCard[]): Set<string> {
  const path = new Set<string>();
  for (const card of due) {
    if (card.parentId === null) continue;
    for (const id of pathToNode(tree, card.parentId)) path.add(id);
  }
  return path;
}

/**
 * Picks the opponent's reply at `nodeId`, preferring branches that lead to a due card
 * (so training gravitates to what you are due to review), else choosing at random.
 */
export function pickOpponentChild(tree: GameTree, nodeId: string | null, towardDue: Set<string>): string | null {
  const children = childrenOf(tree, nodeId);
  if (children.length === 0) return null;
  const preferred = children.filter((id) => towardDue.has(id));
  const pool = preferred.length > 0 ? preferred : children;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Whether a played move (UCI) matches one of the prepared replies. */
export function isPreparedReply(expected: readonly string[], playedUci: string): boolean {
  return expected.includes(playedUci);
}
