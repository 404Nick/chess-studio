import { Chess, type Move } from 'chess.js';
import type { GameTree, Line, MoveNode, PieceSymbol, Square, TreeNode } from '@/types';
import { START_FEN } from './fen';
import type { MoveInput } from './line';

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${counter.toString(36)}`;
}

export function emptyTree(startFen: string = START_FEN): GameTree {
  return { startFen, rootChildren: [], nodes: {}, cursor: null };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** Child ids of a node (or the root when `id` is null). */
export function childrenOf(tree: GameTree, id: string | null): readonly string[] {
  if (id === null) return tree.rootChildren;
  return tree.nodes[id]?.children ?? [];
}

export function parentOf(tree: GameTree, id: string | null): string | null {
  if (id === null) return null;
  return tree.nodes[id]?.parentId ?? null;
}

export function nodeOf(tree: GameTree, id: string | null): MoveNode | null {
  if (id === null) return null;
  return tree.nodes[id]?.move ?? null;
}

/** FEN at a node (the position *after* its move), or the start position for null. */
export function fenOfNode(tree: GameTree, id: string | null): string {
  return id === null ? tree.startFen : (tree.nodes[id]?.move.fenAfter ?? tree.startFen);
}

export function currentFen(tree: GameTree): string {
  return fenOfNode(tree, tree.cursor);
}

export function currentNode(tree: GameTree): MoveNode | null {
  return nodeOf(tree, tree.cursor);
}

/** Node ids from the first move down to `id` (inclusive). Empty for the start. */
export function pathToNode(tree: GameTree, id: string | null): string[] {
  const path: string[] = [];
  let current = id;
  while (current !== null) {
    path.push(current);
    current = parentOf(tree, current);
  }
  return path.reverse();
}

/** The played moves from the start to `id`, in order. */
export function movesToNode(tree: GameTree, id: string | null): MoveNode[] {
  return pathToNode(tree, id).map((nodeId) => tree.nodes[nodeId].move);
}

/** The mainline (following `children[0]` from the root) as a flat move list. */
export function mainline(tree: GameTree): MoveNode[] {
  const moves: MoveNode[] = [];
  let id: string | undefined = tree.rootChildren[0];
  while (id) {
    const node: TreeNode | undefined = tree.nodes[id];
    if (!node) break;
    moves.push(node.move);
    id = node.children[0];
  }
  return moves;
}

/**
 * A `Chess` replayed from the start along the path to `id`. Replaying (rather than
 * loading the stored FEN) keeps repetition history intact for draw detection.
 */
export function chessAtNode(tree: GameTree, id: string | null): Chess {
  let chess: Chess;
  try {
    chess = new Chess(tree.startFen);
  } catch {
    return new Chess(START_FEN);
  }
  for (const move of movesToNode(tree, id)) {
    try {
      chess.move(move.san);
    } catch {
      break;
    }
  }
  return chess;
}

export function chessAtCursor(tree: GameTree): Chess {
  return chessAtNode(tree, tree.cursor);
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function buildNode(move: Move, fenBefore: string, fenAfter: string, ply: number, chess: Chess): MoveNode {
  return {
    id: nextId(),
    ply,
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    from: move.from as Square,
    to: move.to as Square,
    promotion: move.promotion as PieceSymbol | undefined,
    piece: move.piece as PieceSymbol,
    captured: move.captured as PieceSymbol | undefined,
    color: move.color,
    fenBefore,
    fenAfter,
    isCheck: chess.isCheck(),
    isMate: chess.isCheckmate(),
  };
}

export interface TreePlayResult {
  readonly tree: GameTree;
  readonly node: MoveNode;
  /** True when the move already existed and we merely followed it. */
  readonly existing: boolean;
}

/**
 * Plays a move from the cursor. If the position already has that move as a child, the
 * cursor simply follows it (no duplication). Otherwise a new node is appended — the
 * mainline continuation when the cursor had no children, a variation when it did.
 */
export function playMove(tree: GameTree, input: MoveInput | string): TreePlayResult | null {
  const chess = chessAtCursor(tree);
  const fenBefore = chess.fen();

  let move: Move | null = null;
  try {
    move = chess.move(input as never);
  } catch {
    return null;
  }
  if (!move) return null;

  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;

  // Follow an existing continuation rather than creating a duplicate.
  for (const childId of childrenOf(tree, tree.cursor)) {
    if (tree.nodes[childId]?.move.uci === uci) {
      return { tree: { ...tree, cursor: childId }, node: tree.nodes[childId].move, existing: true };
    }
  }

  const ply = pathToNode(tree, tree.cursor).length + 1;
  const node = buildNode(move, fenBefore, chess.fen(), ply, chess);
  const treeNode: TreeNode = { move: node, parentId: tree.cursor, children: [] };

  const nodes = { ...tree.nodes, [node.id]: treeNode };
  if (tree.cursor === null) {
    return {
      tree: { ...tree, nodes, rootChildren: [...tree.rootChildren, node.id], cursor: node.id },
      node,
      existing: false,
    };
  }

  const parent = tree.nodes[tree.cursor];
  nodes[tree.cursor] = { ...parent, children: [...parent.children, node.id] };
  return { tree: { ...tree, nodes, cursor: node.id }, node, existing: false };
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export function goToNode(tree: GameTree, id: string | null): GameTree {
  if (id !== null && !tree.nodes[id]) return tree;
  return id === tree.cursor ? tree : { ...tree, cursor: id };
}

export function toStart(tree: GameTree): GameTree {
  return goToNode(tree, null);
}

export function toPrevious(tree: GameTree): GameTree {
  return goToNode(tree, parentOf(tree, tree.cursor));
}

/** Advances along the mainline continuation of the current node. */
export function toNext(tree: GameTree): GameTree {
  const next = childrenOf(tree, tree.cursor)[0];
  return next ? goToNode(tree, next) : tree;
}

/** Follows the mainline continuation to the end of the current line. */
export function toEnd(tree: GameTree): GameTree {
  let id = tree.cursor;
  let next: string | undefined = childrenOf(tree, id)[0];
  while (next) {
    id = next;
    next = childrenOf(tree, id)[0];
  }
  return goToNode(tree, id);
}

/** Switches to the previous/next sibling variation at the current node. */
export function siblingVariation(tree: GameTree, direction: 1 | -1): GameTree {
  const { cursor } = tree;
  if (cursor === null) return tree;
  const siblings = childrenOf(tree, parentOf(tree, cursor));
  const index = siblings.indexOf(cursor);
  const target = siblings[index + direction];
  return target ? goToNode(tree, target) : tree;
}

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

export function updateNode(tree: GameTree, id: string, patch: Partial<MoveNode>): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, move: { ...node.move, ...patch } } } };
}

/** Every id in the subtree rooted at `id` (inclusive). */
function subtreeIds(tree: GameTree, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    stack.push(...(tree.nodes[current]?.children ?? []));
  }
  return out;
}

/** Deletes a node and its whole subtree. The cursor retreats to the parent if needed. */
export function deleteNode(tree: GameTree, id: string): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;

  const doomed = new Set(subtreeIds(tree, id));
  const nodes: Record<string, TreeNode> = {};
  for (const [key, value] of Object.entries(tree.nodes)) {
    if (!doomed.has(key)) nodes[key] = value;
  }

  const detach = (ids: readonly string[]) => ids.filter((child) => child !== id);
  let rootChildren = tree.rootChildren;
  if (node.parentId === null) {
    rootChildren = detach(tree.rootChildren);
  } else if (nodes[node.parentId]) {
    nodes[node.parentId] = { ...nodes[node.parentId], children: detach(nodes[node.parentId].children) };
  }

  let cursor = tree.cursor;
  if (cursor !== null && doomed.has(cursor)) cursor = node.parentId;

  return { startFen: tree.startFen, rootChildren, nodes, cursor };
}

/** Moves a node to the front of its siblings, making it the mainline at that point. */
export function promoteNode(tree: GameTree, id: string): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;

  const reorder = (ids: readonly string[]) => [id, ...ids.filter((child) => child !== id)];
  if (node.parentId === null) {
    return { ...tree, rootChildren: reorder(tree.rootChildren) };
  }
  const parent = tree.nodes[node.parentId];
  if (!parent || parent.children[0] === id) return tree;
  return {
    ...tree,
    nodes: { ...tree.nodes, [node.parentId]: { ...parent, children: reorder(parent.children) } },
  };
}

/* ------------------------------------------------------------------ */
/* Linear bridges (review, PGN indexing)                               */
/* ------------------------------------------------------------------ */

/** The mainline as a linear {@link Line}, for algorithms that expect one. */
export function mainlineToLine(tree: GameTree): Line {
  const moves = mainline(tree);
  return { startFen: tree.startFen, moves, cursor: moves.length - 1 };
}

/**
 * Copies the per-move `assessment`/`nag` from a reviewed linear line back onto the
 * tree's mainline nodes (matched in order). Used to fold a full-game review — which is
 * computed on the mainline — back into the branching tree.
 */
export function applyReviewedLine(tree: GameTree, reviewed: readonly MoveNode[]): GameTree {
  const nodes = { ...tree.nodes };
  let id: string | undefined = tree.rootChildren[0];
  let index = 0;
  while (id && index < reviewed.length) {
    const node: TreeNode | undefined = nodes[id];
    if (!node) break;
    nodes[id] = {
      ...node,
      move: { ...node.move, assessment: reviewed[index].assessment, nag: reviewed[index].nag ?? node.move.nag },
    };
    id = node.children[0];
    index += 1;
  }
  return { ...tree, nodes };
}

/** True when `id` lies on the mainline (all-first-child path from the root). */
export function isMainline(tree: GameTree, id: string): boolean {
  let current: string | null = id;
  while (current !== null) {
    const parentId = parentOf(tree, current);
    const siblings = childrenOf(tree, parentId);
    if (siblings[0] !== current) return false;
    current = parentId;
  }
  return true;
}
