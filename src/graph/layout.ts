import { buildEffectiveEdges, type DepEdge } from '@/domain/deps';
import type { TaskMap } from '@/domain/types';

export const TILE_W = 176;
export const TILE_H = 48;
export const H_GAP = 28;
export const V_GAP = 56;
export const COMPONENT_GAP = 64;
export const GRAPH_PAD = 24;

export interface Point {
  x: number;
  y: number;
}

export interface GraphNodePos {
  id: string;
  x: number;
  y: number;
  layer: number;
}

export interface GraphEdgePath extends DepEdge {
  points: Point[];
}

export interface GraphLayout {
  nodes: GraphNodePos[];
  edges: GraphEdgePath[];
  width: number;
  height: number;
}

/**
 * Minecraft-advancements style layered DAG layout:
 *  - a task's dependencies sit ABOVE it (roots at layer 0);
 *  - layer = longest dependency path from a root;
 *  - weakly-connected components are packed left-to-right, each with
 *    center-aligned layers;
 *  - edges leave a dependency's bottom, run along a horizontal lane in the
 *    gap below it, then drop straight into the dependent's top edge.
 * Deterministic for a given task map.
 */
export function computeGraphLayout(tasks: TaskMap): GraphLayout {
  const ids = Object.keys(tasks).sort();
  if (ids.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const edges = buildEffectiveEdges(tasks);
  const depsOf = new Map<string, string[]>(); // task -> its dependencies (parents, drawn above)
  const dependentsOf = new Map<string, string[]>(); // task -> tasks that depend on it (children)
  for (const id of ids) {
    depsOf.set(id, []);
    dependentsOf.set(id, []);
  }
  for (const edge of edges) {
    depsOf.get(edge.to)!.push(edge.from);
    dependentsOf.get(edge.from)!.push(edge.to);
  }

  const layer = computeLayers(ids, depsOf);

  // --- Split into weakly connected components (sorted for determinism). ---
  const componentOf = new Map<string, number>();
  let componentCount = 0;
  for (const id of ids) {
    if (componentOf.has(id)) continue;
    const queue = [id];
    componentOf.set(id, componentCount);
    while (queue.length) {
      const current = queue.pop()!;
      for (const next of [...depsOf.get(current)!, ...dependentsOf.get(current)!]) {
        if (!componentOf.has(next)) {
          componentOf.set(next, componentCount);
          queue.push(next);
        }
      }
    }
    componentCount++;
  }

  const nodes: GraphNodePos[] = [];
  let offsetX = GRAPH_PAD;
  let maxBottom = 0;

  for (let c = 0; c < componentCount; c++) {
    const members = ids.filter((id) => componentOf.get(id) === c);
    // Layers within this component.
    const layers = new Map<number, string[]>();
    for (const id of members) {
      const l = layer.get(id)!;
      (layers.get(l) ?? layers.set(l, []).get(l)!).push(id);
    }
    const layerNumbers = [...layers.keys()].sort((a, b) => a - b);
    for (const l of layerNumbers) {
      layers
        .get(l)!
        .sort((a, b) => tasks[a].createdAt - tasks[b].createdAt || (a < b ? -1 : 1));
    }

    orderLayers(layers, layerNumbers, depsOf, dependentsOf);

    const widthOf = (l: number) => {
      const n = layers.get(l)!.length;
      return n * TILE_W + (n - 1) * H_GAP;
    };
    const componentWidth = Math.max(...layerNumbers.map(widthOf));

    for (const l of layerNumbers) {
      const row = layers.get(l)!;
      const rowWidth = widthOf(l);
      const start = offsetX + (componentWidth - rowWidth) / 2;
      row.forEach((id, i) => {
        const y = GRAPH_PAD + l * (TILE_H + V_GAP);
        nodes.push({ id, x: start + i * (TILE_W + H_GAP), y, layer: l });
        maxBottom = Math.max(maxBottom, y + TILE_H);
      });
    }

    offsetX += componentWidth + COMPONENT_GAP;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const routed = routeEdges(edges, nodeById, depsOf);

  return {
    nodes,
    edges: routed,
    width: offsetX - COMPONENT_GAP + GRAPH_PAD,
    height: maxBottom + GRAPH_PAD,
  };
}

/** Longest-path layering; edges that would close a cycle are ignored defensively. */
function computeLayers(ids: string[], depsOf: Map<string, string[]>): Map<string, number> {
  const layer = new Map<string, number>();
  const state = new Map<string, 'visiting' | 'done'>();

  function visit(id: string): number {
    const known = layer.get(id);
    if (known !== undefined && state.get(id) === 'done') return known;
    if (state.get(id) === 'visiting') return 0; // cycle guard: treat back edge as root
    state.set(id, 'visiting');
    let result = 0;
    for (const dep of depsOf.get(id)!) {
      if (state.get(dep) === 'visiting') continue;
      result = Math.max(result, visit(dep) + 1);
    }
    state.set(id, 'done');
    layer.set(id, result);
    return result;
  }

  for (const id of ids) visit(id);
  return layer;
}

/** Four barycenter sweeps over normalized positions to reduce crossings. */
function orderLayers(
  layers: Map<number, string[]>,
  layerNumbers: number[],
  depsOf: Map<string, string[]>,
  dependentsOf: Map<string, string[]>,
) {
  const pos = new Map<string, number>();
  const refresh = () => {
    for (const l of layerNumbers) {
      const row = layers.get(l)!;
      row.forEach((id, i) => pos.set(id, row.length === 1 ? 0.5 : i / (row.length - 1)));
    }
  };
  refresh();

  for (let pass = 0; pass < 4; pass++) {
    const down = pass % 2 === 0;
    const order = down ? layerNumbers : [...layerNumbers].reverse();
    for (const l of order) {
      const row = layers.get(l)!;
      const neighborsOf = down ? depsOf : dependentsOf;
      const value = new Map<string, number>();
      row.forEach((id, i) => {
        const neighbors = neighborsOf.get(id)!.filter((n) => pos.has(n));
        const current = row.length === 1 ? 0.5 : i / (row.length - 1);
        value.set(
          id,
          neighbors.length
            ? neighbors.reduce((sum, n) => sum + pos.get(n)!, 0) / neighbors.length
            : current,
        );
      });
      const before = new Map(row.map((id, i) => [id, i]));
      row.sort((a, b) => value.get(a)! - value.get(b)! || before.get(a)! - before.get(b)!);
      refresh();
    }
  }
}

/**
 * Orthogonal edge routing. Every dependency gets one horizontal lane in the
 * gap directly below it; edges drop from its bottom center, run along the
 * lane, then fall straight down into the dependent's top. Dependents with
 * several parents get spread entry points. Long edges simply pass behind
 * intermediate tiles (nodes are painted on top).
 */
function routeEdges(
  edges: DepEdge[],
  nodeById: Map<string, GraphNodePos>,
  depsOf: Map<string, string[]>,
): GraphEdgePath[] {
  // Lane index per parent within its layer gap, ordered by x for stable lanes.
  const parentsByLayer = new Map<number, string[]>();
  for (const edge of edges) {
    const parent = nodeById.get(edge.from);
    if (!parent) continue;
    const list = parentsByLayer.get(parent.layer) ?? [];
    if (!list.includes(edge.from)) list.push(edge.from);
    parentsByLayer.set(parent.layer, list);
  }
  const laneOf = new Map<string, number>();
  for (const list of parentsByLayer.values()) {
    list.sort((a, b) => nodeById.get(a)!.x - nodeById.get(b)!.x || (a < b ? -1 : 1));
    list.forEach((id, i) => laneOf.set(id, i));
  }

  // Entry offsets: index of each parent among the child's parents, by parent x.
  const entryIndex = new Map<string, number>(); // key `${from}->${to}`
  for (const [child, parents] of depsOf) {
    const present = parents.filter((p) => nodeById.has(p));
    present.sort((a, b) => nodeById.get(a)!.x - nodeById.get(b)!.x || (a < b ? -1 : 1));
    present.forEach((p, i) => entryIndex.set(`${p}->${child}`, i - (present.length - 1) / 2));
  }

  const LANE_STEP = 7;
  const LANE_BASE = 10;
  const ENTRY_STEP = 14;

  return edges.flatMap((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return [];
    const startX = from.x + TILE_W / 2;
    const startY = from.y + TILE_H;
    const lane = laneOf.get(edge.from) ?? 0;
    const laneY = startY + Math.min(LANE_BASE + lane * LANE_STEP, V_GAP - 8);
    const endX = to.x + TILE_W / 2 + (entryIndex.get(`${edge.from}->${edge.to}`) ?? 0) * ENTRY_STEP;
    const endY = to.y;
    const points: Point[] =
      Math.abs(startX - endX) < 0.5
        ? [
            { x: startX, y: startY },
            { x: startX, y: endY },
          ]
        : [
            { x: startX, y: startY },
            { x: startX, y: laneY },
            { x: endX, y: laneY },
            { x: endX, y: endY },
          ];
    return [{ ...edge, points }];
  });
}
