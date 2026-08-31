import { describe, expect, it } from 'vitest';
import type { Task, TaskMap, TaskPayload } from '@/domain/types';
import {
  computeGraphLayout,
  TILE_H,
  TILE_W,
  type GraphEdgePath,
  type GraphLayout,
  type GraphNodePos,
  type Point,
} from './layout';

let seq = 0;
function task(id: string, deps: string[] = [], payload?: TaskPayload): Task {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    iconRef: { kind: 'none' },
    payload: payload ?? { kind: 'quest', questName: id },
    explicitDeps: deps,
    createdAt: ++seq,
    updatedAt: seq,
  };
}

function mapOf(...tasks: Task[]): TaskMap {
  return Object.fromEntries(tasks.map((t) => [t.id, t]));
}

function nodeOf(layout: GraphLayout, id: string) {
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
}

function edgeOf(layout: GraphLayout, from: string, to: string) {
  const edge = layout.edges.find((e) => e.from === from && e.to === to);
  if (!edge) throw new Error(`missing edge ${from}->${to}`);
  return edge;
}

/** Does an axis-aligned edge segment run through a tile's box? */
function segmentHitsTile(p: Point, q: Point, node: GraphNodePos) {
  const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x2 > node.x && x1 < node.x + TILE_W && y2 > node.y && y1 < node.y + TILE_H;
}

function segmentsOf(edge: GraphEdgePath): Array<[Point, Point]> {
  return edge.points.slice(1).map((point, i) => [edge.points[i], point]);
}

/** How far two collinear axis-aligned segments run along on top of each other. */
function overlapLength([p, q]: [Point, Point], [r, s]: [Point, Point]): number {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const span = (a: number, b: number, c: number, d: number) =>
    Math.min(Math.max(a, b), Math.max(c, d)) - Math.max(Math.min(a, b), Math.min(c, d));
  if (near(p.y, q.y) && near(r.y, s.y) && near(p.y, r.y)) return span(p.x, q.x, r.x, s.x);
  if (near(p.x, q.x) && near(r.x, s.x) && near(p.x, r.x)) return span(p.y, q.y, r.y, s.y);
  return 0;
}

/** Every guarantee the drawing rests on, checked over a whole layout. */
function expectWellFormed(layout: GraphLayout) {
  for (const a of layout.nodes) {
    for (const b of layout.nodes) {
      if (a.id >= b.id) continue;
      const separated =
        a.x + TILE_W <= b.x || b.x + TILE_W <= a.x || a.y + TILE_H <= b.y || b.y + TILE_H <= a.y;
      expect(separated, `tiles ${a.id} and ${b.id} overlap`).toBe(true);
    }
  }

  for (const edge of layout.edges) {
    // Every bend is a right angle: no diagonals through the drawing.
    for (const [p, q] of segmentsOf(edge)) {
      expect(
        Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01,
        `${edge.from}->${edge.to} has a diagonal segment`,
      ).toBe(true);
    }
    // No line runs under a tile it is not attached to.
    for (const node of layout.nodes) {
      if (node.id === edge.from || node.id === edge.to) continue;
      for (const [p, q] of segmentsOf(edge)) {
        expect(segmentHitsTile(p, q, node), `${edge.from}->${edge.to} crosses ${node.id}`).toBe(
          false,
        );
      }
    }
  }

  // No two lines run along on top of each other.
  for (let a = 0; a < layout.edges.length; a++) {
    for (let b = a + 1; b < layout.edges.length; b++) {
      for (const first of segmentsOf(layout.edges[a])) {
        for (const second of segmentsOf(layout.edges[b])) {
          const overlap = overlapLength(first, second);
          const [x, y] = [layout.edges[a], layout.edges[b]];
          expect(
            overlap,
            `${x.from}->${x.to} and ${y.from}->${y.to} run on top of each other`,
          ).toBeLessThanOrEqual(0.5);
        }
      }
    }
  }
}

describe('computeGraphLayout', () => {
  it('layers a diamond DAG with deps above their dependents', async () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c']));
    const layout = await computeGraphLayout(tasks);
    // Three rows, deps above their dependents, siblings side by side.
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => nodeOf(layout, id));
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBe(c.y);
    expect(b.y).toBeLessThan(d.y);
    expect(Math.abs(b.x - c.x)).toBeGreaterThanOrEqual(TILE_W);
    // Every edge leaves the bottom of its dep and arrives at the top of its
    // dependent, each on a point of its own.
    const outOfA = layout.edges.filter((e) => e.from === 'a');
    expect(outOfA).toHaveLength(2);
    for (const edge of outOfA) {
      expect(edge.points[0].y).toBeGreaterThanOrEqual(nodeOf(layout, 'a').y + TILE_H);
    }
    expect(new Set(outOfA.map((e) => e.points[0].x)).size).toBe(2);
    const intoD = layout.edges.filter((e) => e.to === 'd');
    expect(new Set(intoD.map((e) => e.points[e.points.length - 1].x)).size).toBe(2);
    expectWellFormed(layout);
  });

  it('drops a layer-skipping edge into its dependent without touching what it passes', async () => {
    // a -> b -> c plus d -> c: the d->c edge must not run behind b.
    const tasks = mapOf(task('a'), task('b', ['a']), task('d'), task('c', ['b', 'd']));
    const layout = await computeGraphLayout(tasks);
    expect(nodeOf(layout, 'b').y).toBeLessThan(nodeOf(layout, 'c').y);
    const long = edgeOf(layout, 'd', 'c');
    // It ends on c's top edge, however far it had to come.
    expect(long.points[long.points.length - 1].y).toBeLessThanOrEqual(nodeOf(layout, 'c').y);
    expectWellFormed(layout);
  });

  it('keeps tiles and lines clear of each other on a tangled graph', async () => {
    const tasks = mapOf(
      task('root'),
      task('mid1', ['root']),
      task('mid2', ['root']),
      task('mid3', ['root']),
      task('side'),
      task('deep', ['mid2']),
      task('deeper', ['deep']),
    );
    tasks.deeper.explicitDeps = ['deep', 'root', 'side'];
    tasks.deep.explicitDeps = ['mid2', 'side'];
    expectWellFormed(await computeGraphLayout(tasks));
  });

  it('keeps a wide fan-out and fan-in readable', async () => {
    const tasks = mapOf(
      task('root'),
      ...Array.from({ length: 8 }, (_, i) => task(`mid${i}`, ['root'])),
      task('leaf', ['mid0', 'mid3', 'mid7']),
      task('far', ['root', 'leaf']),
    );
    const layout = await computeGraphLayout(tasks);
    expect(layout.nodes).toHaveLength(11);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expectWellFormed(layout);
  });

  it('packs disconnected chains into blocks that do not overlap', async () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('x'), task('y', ['x']));
    const layout = await computeGraphLayout(tasks);
    // The two chains keep to their own block: no tile of one sits inside the
    // other's bounding box.
    const box = (ids: string[]) => {
      const members = ids.map((id) => nodeOf(layout, id));
      return {
        x1: Math.min(...members.map((n) => n.x)),
        x2: Math.max(...members.map((n) => n.x)) + TILE_W,
        y1: Math.min(...members.map((n) => n.y)),
        y2: Math.max(...members.map((n) => n.y)) + TILE_H,
      };
    };
    const [first, second] = [box(['a', 'b']), box(['x', 'y'])];
    expect(
      first.x2 <= second.x1 ||
        second.x2 <= first.x1 ||
        first.y2 <= second.y1 ||
        second.y2 <= first.y1,
    ).toBe(true);
    expectWellFormed(layout);
  });

  it('is deterministic', async () => {
    const build = () =>
      mapOf(task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c']), task('e'));
    seq = 0;
    const first = await computeGraphLayout(build());
    seq = 0;
    const second = await computeGraphLayout(build());
    expect(second).toEqual(first);
  });

  it('does not depend on the order the task map was built in', async () => {
    const build = () => [task('a'), task('b', ['a']), task('c', ['a', 'b']), task('d')];
    seq = 0;
    const forwards = await computeGraphLayout(mapOf(...build()));
    seq = 0;
    const backwards = await computeGraphLayout(mapOf(...build().reverse()));
    expect(backwards.nodes.sort((m, n) => (m.id < n.id ? -1 : 1))).toEqual(
      forwards.nodes.sort((m, n) => (m.id < n.id ? -1 : 1)),
    );
  });

  it('includes auto level edges with their kind', async () => {
    const tasks = mapOf(
      task('h10', [], { kind: 'level', skill: 'Herblore', level: 10 }),
      task('h50', [], { kind: 'level', skill: 'Herblore', level: 50 }),
    );
    const layout = await computeGraphLayout(tasks);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({ from: 'h10', to: 'h50', kind: 'auto' });
    expect(nodeOf(layout, 'h10').y).toBeLessThan(nodeOf(layout, 'h50').y);
  });

  it('lays out a task with no dependencies at all', async () => {
    const layout = await computeGraphLayout(mapOf(task('lonely')));
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.width).toBeGreaterThanOrEqual(TILE_W);
  });

  it('handles the empty map', async () => {
    expect(await computeGraphLayout({})).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });
});
