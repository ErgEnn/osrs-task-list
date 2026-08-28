import { describe, expect, it } from 'vitest';
import type { Task } from '@/domain/types';
import { emptyColumns } from '@/store/taskStore';
import { BUNDLE_VERSION, parseBundle, parseBundleJson, subsetWithDeps } from './bundle';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    iconRef: { kind: 'none' },
    payload: { kind: 'quest', questName: id },
    explicitDeps: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('parseBundle', () => {
  it('upgrades a v1 bundle by seeding updatedAt from createdAt', () => {
    const v1 = {
      v: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tasks: {
        a: { ...task('a', { createdAt: 777 }), updatedAt: undefined },
      },
      columns: { todo: ['a'], inprogress: [], done: [] },
    };
    const { bundle } = parseBundle(JSON.parse(JSON.stringify(v1)));
    expect(bundle.v).toBe(BUNDLE_VERSION);
    expect(bundle.tasks.a.updatedAt).toBe(777);
    expect(bundle.deleted).toEqual({});
  });

  it('drops entries that are not tasks and counts them', () => {
    const { bundle, skipped } = parseBundle({
      v: 2,
      tasks: {
        good: task('good'),
        mismatched: task('other'),
        junk: { id: 'junk' },
        nope: 5,
      },
      columns: { todo: ['good', 7] },
      deleted: { x: 1 },
    });
    expect(Object.keys(bundle.tasks)).toEqual(['good']);
    expect(skipped).toBe(3);
    expect(bundle.columns.todo).toEqual(['good']);
    expect(bundle.deleted).toEqual({ x: 1 });
  });

  it('ignores a tombstone for a task the same bundle still carries', () => {
    const { bundle } = parseBundle({ v: 2, tasks: { a: task('a') }, deleted: { a: 9 } });
    expect(bundle.deleted).toEqual({});
    expect(bundle.tasks.a).toBeDefined();
  });

  it('rejects anything that is not a bundle', () => {
    expect(() => parseBundle(null)).toThrow(/not an OSRS Task List bundle/);
    expect(() => parseBundle({ tasks: {} })).toThrow(/not an OSRS Task List bundle/);
    expect(() => parseBundle({ v: 99, tasks: {} })).toThrow(/not an OSRS Task List bundle/);
    expect(() => parseBundleJson('{oops')).toThrow(/not valid JSON/);
  });
});

describe('subsetWithDeps', () => {
  it('pulls in dependencies transitively so nothing dangles', () => {
    const bundle = {
      v: BUNDLE_VERSION,
      exportedAt: '',
      tasks: {
        top: task('top', { explicitDeps: ['mid'] }),
        mid: task('mid', { explicitDeps: ['base'] }),
        base: task('base'),
        unrelated: task('unrelated'),
      },
      columns: { ...emptyColumns(), todo: ['top', 'mid', 'base', 'unrelated'] },
      deleted: {},
    };
    const subset = subsetWithDeps(bundle, ['top']);
    expect(Object.keys(subset.tasks).sort()).toEqual(['base', 'mid', 'top']);
    expect(subset.columns.todo).toEqual(['top', 'mid', 'base']);
  });

  it('survives a dependency cycle in the stored data', () => {
    const bundle = {
      v: BUNDLE_VERSION,
      exportedAt: '',
      tasks: {
        a: task('a', { explicitDeps: ['b'] }),
        b: task('b', { explicitDeps: ['a'] }),
      },
      columns: { ...emptyColumns(), todo: ['a', 'b'] },
      deleted: {},
    };
    expect(Object.keys(subsetWithDeps(bundle, ['a']).tasks).sort()).toEqual(['a', 'b']);
  });
});
