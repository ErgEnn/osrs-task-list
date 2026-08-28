import { describe, expect, it } from 'vitest';
import type { Status, Task, TaskMap } from '@/domain/types';
import { emptyColumns } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';
import { mergeBundles } from './merge';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    status: 'todo',
    iconRef: { kind: 'none' },
    payload: { kind: 'quest', questName: id },
    explicitDeps: [],
    createdAt: 100,
    updatedAt: 100,
    ...over,
  };
}

function bundle(tasks: Task[], over: Partial<SyncBundle> = {}): SyncBundle {
  const map: TaskMap = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const columns = emptyColumns();
  for (const t of tasks) columns[t.status].push(t.id);
  return {
    v: BUNDLE_VERSION,
    exportedAt: new Date(0).toISOString(),
    tasks: map,
    columns,
    deleted: {},
    ...over,
  };
}

const idsIn = (b: SyncBundle, status: Status) => b.columns[status];

describe('mergeBundles', () => {
  it('adds tasks the local device has never seen and keeps local ones', () => {
    const { bundle: merged, report } = mergeBundles(
      bundle([task('local')]),
      bundle([task('remote')]),
    );
    expect(Object.keys(merged.tasks).sort()).toEqual(['local', 'remote']);
    expect(report.added).toEqual(['remote']);
    expect(report.updated).toEqual([]);
    expect(report.unchanged).toBe(1);
  });

  it('resolves a conflict in favour of the newer edit, whole record at a time', () => {
    const local = bundle([task('t', { title: 'old', description: 'keep me', updatedAt: 200 })]);
    const incoming = bundle([task('t', { title: 'new', description: '', updatedAt: 300 })]);
    const { bundle: merged, report } = mergeBundles(local, incoming);
    expect(merged.tasks.t.title).toBe('new');
    expect(merged.tasks.t.description).toBe('');
    expect(report.updated).toEqual(['new']);
  });

  it('keeps the local version when it is the newer edit', () => {
    const local = bundle([task('t', { title: 'local wins', updatedAt: 400 })]);
    const incoming = bundle([task('t', { title: 'stale', updatedAt: 300 })]);
    const { bundle: merged, report } = mergeBundles(local, incoming);
    expect(merged.tasks.t.title).toBe('local wins');
    expect(report.updated).toEqual([]);
    expect(report.unchanged).toBe(1);
  });

  it('breaks an exact timestamp tie towards the more advanced status', () => {
    const local = bundle([task('t', { status: 'todo', updatedAt: 500 })]);
    const incoming = bundle([task('t', { status: 'done', updatedAt: 500 })]);
    expect(mergeBundles(local, incoming).bundle.tasks.t.status).toBe('done');
    expect(mergeBundles(incoming, local).bundle.tasks.t.status).toBe('done');
  });

  it('propagates a delete from the other device', () => {
    const local = bundle([task('gone', { updatedAt: 100 })]);
    const incoming = bundle([], { deleted: { gone: 200 } });
    const { bundle: merged, report } = mergeBundles(local, incoming);
    expect(merged.tasks.gone).toBeUndefined();
    expect(merged.deleted.gone).toBe(200);
    expect(report.removed).toEqual(['gone']);
  });

  it('does not resurrect a task this device deleted', () => {
    const local = bundle([], { deleted: { gone: 300 } });
    const incoming = bundle([task('gone', { updatedAt: 100 })]);
    const { bundle: merged, report } = mergeBundles(local, incoming);
    expect(merged.tasks.gone).toBeUndefined();
    expect(report.added).toEqual([]);
  });

  it('lets an edit made after the delete win over the tombstone', () => {
    const local = bundle([], { deleted: { revived: 300 } });
    const incoming = bundle([task('revived', { updatedAt: 400 })]);
    const { bundle: merged } = mergeBundles(local, incoming);
    expect(merged.tasks.revived).toBeDefined();
    expect(merged.deleted.revived).toBeUndefined();
  });

  it('is idempotent — merging the same bundle twice changes nothing', () => {
    const local = bundle([task('a'), task('b', { status: 'done' })]);
    const incoming = bundle([task('c', { updatedAt: 900 })]);
    const first = mergeBundles(local, incoming);
    const second = mergeBundles(first.bundle, incoming);
    expect(second.report.added).toEqual([]);
    expect(second.report.updated).toEqual([]);
    expect(second.bundle.tasks).toEqual(first.bundle.tasks);
  });

  it('converges to the same tasks whichever side merges first', () => {
    const a = bundle([task('shared', { title: 'A', updatedAt: 200 }), task('onlyA')]);
    const b = bundle([task('shared', { title: 'B', updatedAt: 300 }), task('onlyB')], {
      deleted: { old: 50 },
    });
    const ab = mergeBundles(a, b).bundle;
    const ba = mergeBundles(b, a).bundle;
    expect(ab.tasks).toEqual(ba.tasks);
    expect(ab.deleted).toEqual(ba.deleted);
  });

  it('keeps local column order and appends incoming-only tasks after it', () => {
    const local = bundle([task('l1'), task('l2')]);
    local.columns.todo = ['l2', 'l1'];
    const incoming = bundle([task('r1'), task('l1')]);
    incoming.columns.todo = ['r1', 'l1'];
    const { bundle: merged } = mergeBundles(local, incoming);
    expect(idsIn(merged, 'todo')).toEqual(['l2', 'l1', 'r1']);
  });

  it('never lists a task in more than one column', () => {
    const local = bundle([task('t', { status: 'todo', updatedAt: 100 })]);
    const incoming = bundle([task('t', { status: 'done', updatedAt: 200 })]);
    const { bundle: merged } = mergeBundles(local, incoming);
    expect(merged.columns.todo).toEqual([]);
    expect(merged.columns.done).toEqual(['t']);
    expect(merged.tasks.t.status).toBe('done');
  });
});
