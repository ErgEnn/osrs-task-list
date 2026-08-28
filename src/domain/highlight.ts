import type { DepEdge } from './deps';

export interface DepHighlight {
  /** The hovered task itself. */
  rootId: string;
  /** The hovered task plus everything it depends on, transitively. */
  nodes: ReadonlySet<string>;
  /** Keys of the edges running between two highlighted tasks. */
  edges: ReadonlySet<string>;
}

export const depEdgeKey = (from: string, to: string) => `${from}->${to}`;

/** What one task is to the current hover: the hovered task, a prerequisite of it, or neither. */
export type HighlightRole = 'root' | 'dep' | 'muted';

export function highlightRoleOf(
  highlight: DepHighlight | null,
  id: string,
): HighlightRole | null {
  if (highlight === null) return null;
  if (highlight.rootId === id) return 'root';
  return highlight.nodes.has(id) ? 'dep' : 'muted';
}

/**
 * The prerequisite chain behind one task: itself, its dependencies, their
 * dependencies, and so on. Nothing downstream — pointing at a task answers
 * "what do I need first?", not "what does this unlock?".
 *
 * Returns null for no hover, so callers can tell "nothing highlighted" (leave
 * everything at rest) from "highlighted, and this task is not in it".
 * Safe against cycles, which the layout tolerates rather than rejects.
 */
export function computeDepHighlight(
  edges: readonly DepEdge[],
  rootId: string | null,
): DepHighlight | null {
  if (rootId === null) return null;

  const depsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const list = depsOf.get(edge.to);
    if (list) list.push(edge.from);
    else depsOf.set(edge.to, [edge.from]);
  }

  const nodes = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const dep of depsOf.get(current) ?? []) {
      if (nodes.has(dep)) continue; // also the cycle guard
      nodes.add(dep);
      stack.push(dep);
    }
  }

  const keys = new Set<string>();
  for (const edge of edges) {
    if (nodes.has(edge.from) && nodes.has(edge.to)) keys.add(depEdgeKey(edge.from, edge.to));
  }
  return { rootId, nodes, edges: keys };
}
