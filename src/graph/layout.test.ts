import { describe, expect, it } from 'vitest';
import type { Task, TaskMap, TaskPayload } from '@/domain/types';
import {
  computeGraphLayout,
  TILE_H,
  TILE_W,
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

function nodeOf(layout: ReturnType<typeof computeGraphLayout>, id: string) {
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
}

/** Does an axis-aligned edge segment run through a tile's box? */
function segmentHitsTile(p: Point, q: Point, node: GraphNodePos) {
  const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x2 > node.x && x1 < node.x + TILE_W && y2 > node.y && y1 < node.y + TILE_H;
}

describe('computeGraphLayout', () => {
  it('layers a diamond DAG by longest path with deps above', () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c']));
    const layout = computeGraphLayout(tasks);
    expect(nodeOf(layout, 'a').layer).toBe(0);
    expect(nodeOf(layout, 'b').layer).toBe(1);
    expect(nodeOf(layout, 'c').layer).toBe(1);
    expect(nodeOf(layout, 'd').layer).toBe(2);
    // Deps sit above: smaller y.
    expect(nodeOf(layout, 'a').y).toBeLessThan(nodeOf(layout, 'd').y);
    // d has two entry points, one per parent.
    const intoD = layout.edges.filter((e) => e.to === 'd');
    expect(intoD).toHaveLength(2);
    const entryXs = intoD.map((e) => e.points[e.points.length - 1].x);
    expect(new Set(entryXs).size).toBe(2);
  });

  it('takes the longest path when layers disagree', () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('c', ['a', 'b']));
    const layout = computeGraphLayout(tasks);
    expect(nodeOf(layout, 'c').layer).toBe(2);
    const longEdge = layout.edges.find((e) => e.from === 'a' && e.to === 'c');
    expect(longEdge).toBeDefined();
    expect(longEdge!.points.length).toBeGreaterThanOrEqual(2);
    // The long edge ends at c's top edge.
    const last = longEdge!.points[longEdge!.points.length - 1];
    expect(last.y).toBe(nodeOf(layout, 'c').y);
  });

  it('routes layer-skipping edges clear of the tiles in between', () => {
    // a -> b -> c plus d -> c: the d->c edge must not run behind b.
    const tasks = mapOf(task('a'), task('b', ['a']), task('d'), task('c', ['b', 'd']));
    const layout = computeGraphLayout(tasks);
    expect(nodeOf(layout, 'c').layer).toBe(2);
    expect(nodeOf(layout, 'd').layer).toBe(0);

    const long = layout.edges.find((e) => e.from === 'd' && e.to === 'c')!;
    expect(long).toBeDefined();
    for (const node of layout.nodes) {
      for (let i = 1; i < long.points.length; i++) {
        const [p, q] = [long.points[i - 1], long.points[i]];
        expect(
          segmentHitsTile(p, q, node),
          `d->c segment ${JSON.stringify([p, q])} crosses ${node.id}`,
        ).toBe(false);
      }
    }
  });

  it('keeps every edge out of the tiles it is not attached to', () => {
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
    const layout = computeGraphLayout(tasks);
    for (const edge of layout.edges) {
      for (const node of layout.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        for (let i = 1; i < edge.points.length; i++) {
          const [p, q] = [edge.points[i - 1], edge.points[i]];
          expect(
            segmentHitsTile(p, q, node),
            `${edge.from}->${edge.to} crosses ${node.id}`,
          ).toBe(false);
        }
      }
    }
  });

  it('gives layer-skipping edges into one task separate arrival lanes', () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('x'), task('y'), task('c', ['b']));
    tasks.c.explicitDeps = ['b', 'x', 'y'];
    const layout = computeGraphLayout(tasks);
    const detours = layout.edges.filter((e) => (e.from === 'x' || e.from === 'y') && e.to === 'c');
    expect(detours).toHaveLength(2);
    // Each turns into c inside the gap directly above it...
    const jogYs = detours.map((e) => e.points[e.points.length - 2].y);
    for (const y of jogYs) {
      expect(y).toBeGreaterThan(nodeOf(layout, 'b').y + TILE_H);
      expect(y).toBeLessThan(nodeOf(layout, 'c').y);
    }
    // ...and the two turns sit at different heights.
    expect(new Set(jogYs).size).toBe(2);
  });

  it('packs disconnected components side by side without overlap', () => {
    const tasks = mapOf(task('a'), task('b', ['a']), task('x'), task('y', ['x']));
    const layout = computeGraphLayout(tasks);
    const [left, right] = [nodeOf(layout, 'a'), nodeOf(layout, 'x')].sort((m, n) => m.x - n.x);
    expect(right.x).toBeGreaterThanOrEqual(left.x + TILE_W);
  });

  it('never overlaps node tiles', () => {
    const tasks = mapOf(
      task('root'),
      ...Array.from({ length: 8 }, (_, i) => task(`mid${i}`, ['root'])),
      task('leaf', ['mid0', 'mid3', 'mid7']),
    );
    const layout = computeGraphLayout(tasks);
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.id === b.id) continue;
        const separated =
          a.x + TILE_W <= b.x || b.x + TILE_W <= a.x || a.y + TILE_H <= b.y || b.y + TILE_H <= a.y;
        expect(separated, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const build = () =>
      mapOf(task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c']), task('e'));
    seq = 0;
    const first = computeGraphLayout(build());
    seq = 0;
    const second = computeGraphLayout(build());
    expect(second).toEqual(first);
  });

  it('includes auto level edges with their kind', () => {
    const tasks = mapOf(
      task('h10', [], { kind: 'level', skill: 'Herblore', level: 10 }),
      task('h50', [], { kind: 'level', skill: 'Herblore', level: 50 }),
    );
    const layout = computeGraphLayout(tasks);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({ from: 'h10', to: 'h50', kind: 'auto' });
    expect(nodeOf(layout, 'h10').layer).toBe(0);
    expect(nodeOf(layout, 'h50').layer).toBe(1);
  });

  it('handles the empty map', () => {
    expect(computeGraphLayout({})).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });
});
