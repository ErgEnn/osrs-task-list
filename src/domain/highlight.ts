import type { DepEdge } from './deps';

export interface DepHighlight {
  /** The hovered task itself. */
  rootId: string;
  /** The hovered task plus everything it depends on, transitively. */
  nodes: ReadonlySet<string>;
  /** Keys of the edges running between two highlighted tasks. */
  edges: ReadonlySet<string>;
  /**
   * Everything that depends on the hovered task, transitively — what it
   * unlocks. Empty unless the caller asked for it (see `withUnlocks`), and
   * never contains the root itself.
   */
  unlockNodes: ReadonlySet<string>;
  /** Keys of the edges running down the unlock chain, root's own included. */
  unlockEdges: ReadonlySet<string>;
}

export const depEdgeKey = (from: string, to: string) => `${from}->${to}`;

/**
 * What one task is to the current hover: the hovered task, a prerequisite of
 * it, something it unlocks, or none of those.
 */
export type HighlightRole = 'root' | 'dep' | 'unlock' | 'muted';

export function highlightRoleOf(highlight: DepHighlight | null, id: string): HighlightRole | null {
  if (highlight === null) return null;
  if (highlight.rootId === id) return 'root';
  // Prerequisites win over unlocks: a cycle can make a task both, and "what do
  // I need first?" is the question the hover answers first.
  if (highlight.nodes.has(id)) return 'dep';
  return highlight.unlockNodes.has(id) ? 'unlock' : 'muted';
}

/** What one edge is to the current hover — the same three ways as a task. */
export type HighlightEdgeRole = 'dep' | 'unlock' | 'muted';

export function highlightEdgeRoleOf(
  highlight: DepHighlight | null,
  from: string,
  to: string,
): HighlightEdgeRole | null {
  if (highlight === null) return null;
  const key = depEdgeKey(from, to);
  if (highlight.edges.has(key)) return 'dep';
  return highlight.unlockEdges.has(key) ? 'unlock' : 'muted';
}

interface HighlightOptions {
  /**
   * Also walk downstream, filling `unlockNodes`/`unlockEdges`. Off by default:
   * the board answers only "what do I need first?", while the progression graph
   * has the room to show both directions at once.
   */
  withUnlocks?: boolean;
}

/** Everything reachable from `rootId` along `adjacency`, root included. Cycle-safe. */
function reachableFrom(adjacency: Map<string, string[]>, rootId: string): Set<string> {
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue; // also the cycle guard
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

function edgesWithin(edges: readonly DepEdge[], nodes: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>();
  for (const edge of edges) {
    if (nodes.has(edge.from) && nodes.has(edge.to)) keys.add(depEdgeKey(edge.from, edge.to));
  }
  return keys;
}

/**
 * The prerequisite chain behind one task: itself, its dependencies, their
 * dependencies, and so on — and, with `withUnlocks`, the chain in front of it
 * as well, kept in its own set so the two directions can read differently.
 *
 * Returns null for no hover, so callers can tell "nothing highlighted" (leave
 * everything at rest) from "highlighted, and this task is not in it".
 * Safe against cycles, which the layout tolerates rather than rejects.
 */
export function computeDepHighlight(
  edges: readonly DepEdge[],
  rootId: string | null,
  { withUnlocks = false }: HighlightOptions = {},
): DepHighlight | null {
  if (rootId === null) return null;

  const depsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const deps = depsOf.get(edge.to);
    if (deps) deps.push(edge.from);
    else depsOf.set(edge.to, [edge.from]);
    const dependents = dependentsOf.get(edge.from);
    if (dependents) dependents.push(edge.to);
    else dependentsOf.set(edge.from, [edge.to]);
  }

  const nodes = reachableFrom(depsOf, rootId);
  if (!withUnlocks) {
    return {
      rootId,
      nodes,
      edges: edgesWithin(edges, nodes),
      unlockNodes: new Set(),
      unlockEdges: new Set(),
    };
  }

  // Keep the root in the closure while picking edges — the edges leaving the
  // hovered task are the first thing "what does this unlock?" should show —
  // then drop it, since it is the root and not one of its own unlocks.
  const unlockClosure = reachableFrom(dependentsOf, rootId);
  const unlockEdges = edgesWithin(edges, unlockClosure);
  const unlockNodes = new Set(unlockClosure);
  unlockNodes.delete(rootId);
  return { rootId, nodes, edges: edgesWithin(edges, nodes), unlockNodes, unlockEdges };
}
