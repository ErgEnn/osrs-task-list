import { describe, expect, it } from 'vitest';
import {
  buildEffectiveEdges,
  computeAutoLevelEdges,
  getEffectiveDeps,
  isBlocked,
  sanitizeCycles,
  wouldCreateCycle,
} from './deps';
import type { Task, TaskMap, TaskPayload } from './types';

let seq = 0;
function task(id: string, payload: TaskPayload, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    iconRef: { kind: 'none' },
    payload,
    explicitDeps: [],
    createdAt: ++seq,
    ...over,
  };
}

function mapOf(...tasks: Task[]): TaskMap {
  return Object.fromEntries(tasks.map((t) => [t.id, t]));
}

const herb = (level: number) => ({ kind: 'level', skill: 'Herblore', level }) as const;
const cook = (level: number) => ({ kind: 'level', skill: 'Cooking', level }) as const;

describe('computeAutoLevelEdges', () => {
  it('chains level tasks of the same skill by nearest lower level', () => {
    const tasks = mapOf(task('h10', herb(10)), task('h30', herb(30)), task('h50', herb(50)));
    const edges = computeAutoLevelEdges(tasks);
    expect(edges.get('h30')).toBe('h10');
    expect(edges.get('h50')).toBe('h30');
    expect(edges.get('h10')).toBeUndefined();
  });

  it('gives duplicates at one level the same parent and no edges between them', () => {
    const tasks = mapOf(
      task('h10', herb(10)),
      task('h30a', herb(30)),
      task('h30b', herb(30)),
      task('h50', herb(50)),
    );
    const edges = computeAutoLevelEdges(tasks);
    expect(edges.get('h30a')).toBe('h10');
    expect(edges.get('h30b')).toBe('h10');
    // Deterministic: among ties at the nearest lower level the newest wins.
    expect(edges.get('h50')).toBe('h30b');
  });

  it('does not link tasks across skills', () => {
    const tasks = mapOf(task('h30', herb(30)), task('c40', cook(40)));
    expect(computeAutoLevelEdges(tasks).size).toBe(0);
  });

  it('heals the chain when a middle task is deleted', () => {
    const full = mapOf(task('h10', herb(10)), task('h30', herb(30)), task('h50', herb(50)));
    expect(computeAutoLevelEdges(full).get('h50')).toBe('h30');
    const { h30: _gone, ...rest } = full;
    expect(computeAutoLevelEdges(rest).get('h50')).toBe('h10');
  });
});

describe('getEffectiveDeps / buildEffectiveEdges', () => {
  it('merges explicit and auto deps without duplicates', () => {
    const tasks = mapOf(
      task('h10', herb(10)),
      task('quest', { kind: 'quest', questName: 'Druidic Ritual' }),
      task('h30', herb(30), { explicitDeps: ['quest', 'h10'] }),
    );
    expect(getEffectiveDeps(tasks, 'h30').sort()).toEqual(['h10', 'quest']);
    const edges = buildEffectiveEdges(tasks);
    const toH30 = edges.filter((e) => e.to === 'h30');
    expect(toH30).toHaveLength(2);
    // The explicit duplicate of the auto edge is reported once, as auto.
    expect(toH30.find((e) => e.from === 'h10')?.kind).toBe('auto');
    expect(toH30.find((e) => e.from === 'quest')?.kind).toBe('explicit');
  });

  it('ignores dangling and self deps', () => {
    const tasks = mapOf(task('a', herb(10), { explicitDeps: ['a', 'missing'] }));
    expect(getEffectiveDeps(tasks, 'a')).toEqual([]);
  });
});

describe('wouldCreateCycle', () => {
  it('detects direct and transitive cycles, and self-deps', () => {
    const tasks = mapOf(
      task('a', { kind: 'quest', questName: 'A' }, { explicitDeps: ['b'] }),
      task('b', { kind: 'quest', questName: 'B' }, { explicitDeps: ['c'] }),
      task('c', { kind: 'quest', questName: 'C' }),
    );
    expect(wouldCreateCycle(tasks, 'c', 'a')).toBe(true); // c -> a -> b -> c
    expect(wouldCreateCycle(tasks, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'c')).toBe(false);
    expect(wouldCreateCycle(tasks, 'a', 'a')).toBe(true);
  });

  it('sees cycles that pass through auto level edges', () => {
    const tasks = mapOf(task('h10', herb(10)), task('h50', herb(50)));
    // h50 auto-depends on h10, so h10 cannot depend on h50.
    expect(wouldCreateCycle(tasks, 'h10', 'h50')).toBe(true);
  });
});

describe('sanitizeCycles', () => {
  it('drops the explicit edge when a payload edit closes a cycle through auto edges', () => {
    // A (Herblore 50) explicitly depends on B (Cooking 40): fine.
    const before = mapOf(task('a', herb(50), { explicitDeps: ['b'] }), task('b', cook(40)));
    expect(sanitizeCycles(before).removed).toEqual([]);

    // B is edited to Herblore 60: now B auto-depends on A while A explicitly
    // depends on B — the explicit edge must go, the auto edge must stay.
    const after: TaskMap = { ...before, b: { ...before.b, payload: herb(60) } };
    const result = sanitizeCycles(after);
    expect(result.removed).toEqual([{ taskId: 'a', depId: 'b' }]);
    expect(result.tasks.a.explicitDeps).toEqual([]);
    const edges = buildEffectiveEdges(result.tasks);
    expect(edges).toEqual([{ from: 'a', to: 'b', kind: 'auto' }]);
  });

  it('leaves acyclic graphs untouched (same reference)', () => {
    const tasks = mapOf(
      task('a', { kind: 'quest', questName: 'A' }, { explicitDeps: ['b'] }),
      task('b', { kind: 'quest', questName: 'B' }),
    );
    const result = sanitizeCycles(tasks);
    expect(result.tasks).toBe(tasks);
    expect(result.removed).toEqual([]);
  });

  it('breaks pure explicit cycles deterministically', () => {
    const tasks = mapOf(
      task('a', { kind: 'quest', questName: 'A' }, { explicitDeps: ['b'] }),
      task('b', { kind: 'quest', questName: 'B' }, { explicitDeps: ['a'] }),
    );
    const result = sanitizeCycles(tasks);
    expect(result.removed).toHaveLength(1);
    expect(buildEffectiveEdges(result.tasks)).toHaveLength(1);
  });
});

describe('isBlocked', () => {
  it('is blocked while any effective dep is not done', () => {
    const tasks = mapOf(
      task('h10', herb(10), { status: 'inprogress' }),
      task('h30', herb(30)),
    );
    expect(isBlocked(tasks, 'h30')).toBe(true);
    tasks.h10 = { ...tasks.h10, status: 'done' };
    expect(isBlocked(tasks, 'h30')).toBe(false);
    expect(isBlocked(tasks, 'h10')).toBe(false);
  });
});
