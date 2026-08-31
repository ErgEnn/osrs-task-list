import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api';
import { buildEffectiveEdges, type DepEdge } from '@/domain/deps';
import type { TaskMap } from '@/domain/types';

export const TILE_W = 176;
export const TILE_H = 48;
/** Side-by-side clearance between two tiles in the same row. */
export const H_GAP = 28;
/** Vertical clearance between two rows — the channel edges are routed through. */
export const V_GAP = 64;
/** Clearance between two unrelated chains packed next to each other. */
export const COMPONENT_GAP = 72;
export const GRAPH_PAD = 24;
/** Sideways clearance kept between an edge and a tile it passes. */
export const EDGE_NODE_GAP = 14;
/** Clearance between two edges sharing a channel. */
export const EDGE_EDGE_GAP = 10;

export interface Point {
  x: number;
  y: number;
}

export interface GraphNodePos {
  id: string;
  x: number;
  y: number;
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

export const EMPTY_LAYOUT: GraphLayout = { nodes: [], edges: [], width: 0, height: 0 };

/**
 * Options handed to ELK's layered (Sugiyama) algorithm. Together they are what
 * keeps the drawing readable:
 *  - `DOWN` puts a task's dependencies above it, roots at the top;
 *  - `ORTHOGONAL` routing bends edges at right angles and gives each one its own
 *    channel between the rows — so a line never runs under a tile, and two lines
 *    never sit on top of each other;
 *  - `spacing.edgeNode` / `spacing.edgeEdge` are the clearances routing keeps,
 *    and `mergeEdges=false` stops the edges out of one tile being drawn as one;
 *  - unrelated chains are laid out on their own and then packed into a roughly
 *    screen-shaped block, rather than running off the side in one endless row.
 */
const LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': `[top=${GRAPH_PAD},left=${GRAPH_PAD},bottom=${GRAPH_PAD},right=${GRAPH_PAD}]`,
  'elk.spacing.nodeNode': String(H_GAP),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(V_GAP),
  'elk.spacing.edgeNode': String(EDGE_NODE_GAP),
  'elk.spacing.edgeEdge': String(EDGE_EDGE_GAP),
  'elk.layered.spacing.edgeNodeBetweenLayers': String(EDGE_NODE_GAP),
  'elk.layered.spacing.edgeEdgeBetweenLayers': String(EDGE_EDGE_GAP),
  'elk.layered.mergeEdges': 'false',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': String(COMPONENT_GAP),
  // Roughly the shape of the box the graph is fitted into, so a list full of
  // unlinked tasks packs into a block instead of one very wide row.
  'elk.aspectRatio': '1.7',
  // Every run over the same task map must draw the same picture.
  'elk.randomSeed': '1',
};

/** Per-tile options: we pin each port to a side, ELK picks the order on it. */
const NODE_OPTIONS: LayoutOptions = {
  'elk.portConstraints': 'FIXED_SIDE',
  'elk.spacing.portPort': '10',
};

// ELK ids share one namespace, and tiles are keyed by task id. Task ids are
// UUIDs, so a '#' prefix keeps the ids we invent for edges and ports clear of
// them however the task map was built.
const edgeId = (index: number) => `#e${index}`;
const sourcePortId = (index: number) => `#e${index}.out`;
const targetPortId = (index: number) => `#e${index}.in`;

/**
 * The tasks and their effective dependencies in a fixed order — creation order,
 * then id — because ELK seeds its crossing minimization from the order it is
 * handed. Without this, two equal task maps that were built up in a different
 * order could draw differently.
 */
function orderedGraph(tasks: TaskMap): { ids: string[]; edges: DepEdge[] } {
  const ids = Object.keys(tasks).sort(
    (a, b) => tasks[a].createdAt - tasks[b].createdAt || (a < b ? -1 : 1),
  );
  const rank = new Map(ids.map((id, i) => [id, i]));
  const edges = buildEffectiveEdges(tasks).sort(
    (a, b) => rank.get(a.from)! - rank.get(b.from)! || rank.get(a.to)! - rank.get(b.to)!,
  );
  return { ids, edges };
}

/**
 * The ELK graph for a task map: one fixed-size tile per task, and one edge per
 * effective dependency, attached to a port of its own on the bottom of the
 * dependency and the top of the dependent. A port per edge is what keeps two
 * lines leaving the same tile from starting at the same point.
 */
function toElkGraph(ids: string[], edges: DepEdge[]): ElkNode {
  const portsOf = new Map<string, ElkNode['ports']>(ids.map((id) => [id, []]));
  edges.forEach((edge, i) => {
    portsOf.get(edge.from)!.push({
      id: sourcePortId(i),
      width: 1,
      height: 1,
      layoutOptions: { 'elk.port.side': 'SOUTH' },
    });
    portsOf.get(edge.to)!.push({
      id: targetPortId(i),
      width: 1,
      height: 1,
      layoutOptions: { 'elk.port.side': 'NORTH' },
    });
  });

  return {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: ids.map((id) => ({
      id,
      width: TILE_W,
      height: TILE_H,
      layoutOptions: NODE_OPTIONS,
      ports: portsOf.get(id),
    })),
    edges: edges.map((_edge, i) => ({
      id: edgeId(i),
      sources: [sourcePortId(i)],
      targets: [targetPortId(i)],
    })),
  };
}

/** Reads ELK's answer back into the shape the canvas draws. */
function fromElkGraph(edges: DepEdge[], laid: ElkNode): GraphLayout {
  const byElkId = new Map(edges.map((edge, i) => [edgeId(i), edge]));

  const nodes: GraphNodePos[] = (laid.children ?? []).map((child) => ({
    id: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
  }));
  nodes.sort((a, b) => (a.id < b.id ? -1 : 1));

  const paths: GraphEdgePath[] = [];
  for (const laidEdge of (laid.edges ?? []) as ElkExtendedEdge[]) {
    const edge = byElkId.get(laidEdge.id);
    if (!edge) continue;
    const points: Point[] = [];
    for (const section of laidEdge.sections ?? []) {
      points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint);
    }
    const trimmed = dropRepeats(points);
    if (trimmed.length < 2) continue;
    paths.push({ ...edge, points: trimmed });
  }
  paths.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));

  return { nodes, edges: paths, width: laid.width ?? 0, height: laid.height ?? 0 };
}

/** Drops the zero-length steps ELK leaves where two sections meet. */
function dropRepeats(points: Point[]): Point[] {
  return points.filter((point, i) => {
    const previous = points[i - 1];
    return (
      !previous || Math.abs(previous.x - point.x) > 0.01 || Math.abs(previous.y - point.y) > 0.01
    );
  });
}

/** ELK is loaded on demand: it is by far the heaviest thing this app ships. */
let enginePromise: Promise<{ layout: (graph: ElkNode) => Promise<ElkNode> }> | null = null;

function engine() {
  enginePromise ??= import('elkjs/lib/elk.bundled.js').then(({ default: Elk }) => new Elk());
  return enginePromise;
}

/**
 * Lay the progression graph out with ELK's layered algorithm: dependencies
 * above their dependents, unrelated chains packed alongside, and orthogonal
 * edges routed through the channels between rows, so no line crosses a tile or
 * another line. Deterministic for a given task map.
 */
export async function computeGraphLayout(tasks: TaskMap): Promise<GraphLayout> {
  const { ids, edges } = orderedGraph(tasks);
  if (ids.length === 0) return EMPTY_LAYOUT;
  const elk = await engine();
  return fromElkGraph(edges, await elk.layout(toElkGraph(ids, edges)));
}
