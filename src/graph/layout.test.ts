import { describe, expect, it } from 'vitest';
import type { Task, TaskMap, TaskPayload } from '@/domain/types';
import { computeGraphLayout, TILE_H, TILE_W } from './layout';

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
