import { describe, expect, it } from 'vitest';
import type { Task, TaskMap, TaskPayload } from '@/domain/types';
import {
  columnDropId,
  computeLinkOptions,
  decodeDropId,
  depDropId,
  gapDropId,
  insertIndexFor,
  linkPairFor,
} from './dropTargets';

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
    updatedAt: seq,
    ...over,
  };
}

function mapOf(...tasks: Task[]): TaskMap {
  return Object.fromEntries(tasks.map((t) => [t.id, t]));
}

const quest = (questName: string) => ({ kind: 'quest', questName }) as const;
const herb = (level: number) => ({ kind: 'level', skill: 'Herblore', level }) as const;

describe('drop ids', () => {
  it('round-trips every target shape', () => {
    expect(decodeDropId(gapDropId('todo', 'abc'))).toEqual({
      kind: 'gap',
      status: 'todo',
      beforeId: 'abc',
    });
    expect(decodeDropId(gapDropId('done', null))).toEqual({
      kind: 'gap',
      status: 'done',
      beforeId: null,
    });
    expect(decodeDropId(depDropId('dependency', 'abc'))).toEqual({
      kind: 'dep',
      role: 'dependency',
      taskId: 'abc',
    });
    expect(decodeDropId(depDropId('dependent', 'abc'))).toEqual({
      kind: 'dep',
      role: 'dependent',
      taskId: 'abc',
    });
    expect(decodeDropId(columnDropId('inprogress'))).toEqual({
      kind: 'column',
      status: 'inprogress',
    });
  });

  it('rejects ids that are not drop targets', () => {
    // A card's own id is a draggable, never a droppable.
    expect(decodeDropId('7e1c0e2a-1111-4bbb-8ccc-000000000001')).toBeNull();
    expect(decodeDropId('gap:nowhere:abc')).toBeNull();
    expect(decodeDropId('column:nowhere')).toBeNull();
    expect(decodeDropId('dep:sideways:abc')).toBeNull();
    expect(decodeDropId('dep:dependency:')).toBeNull();
  });
});

describe('insertIndexFor', () => {
  const column = ['a', 'b', 'c'];

  it('counts against the column the dragged card has been pulled out of', () => {
    // b moved above a: [a, c] with b spliced in at 0.
    expect(insertIndexFor(column, 'b', 'a')).toBe(0);
    // b dropped in the gap it already sits in is a no-op: [a, c] at 1.
    expect(insertIndexFor(column, 'b', 'c')).toBe(1);
  });

  it('appends for the trailing gap and for cards from another column', () => {
    expect(insertIndexFor(column, 'b', null)).toBe(2);
    expect(insertIndexFor(column, 'z', null)).toBe(3);
    expect(insertIndexFor(column, 'z', 'c')).toBe(2);
  });

  it('appends when the neighbour is gone (a stale drop after a sync)', () => {
    expect(insertIndexFor(column, 'a', 'deleted')).toBe(2);
  });
});

describe('linkPairFor', () => {
  it('reads the card halves as "the dragged card goes above / below"', () => {
    expect(linkPairFor('dragged', { role: 'dependency', taskId: 'target' })).toEqual({
      dependentId: 'target',
      depId: 'dragged',
    });
    expect(linkPairFor('dragged', { role: 'dependent', taskId: 'target' })).toEqual({
      dependentId: 'dragged',
      depId: 'target',
    });
  });
});

describe('computeLinkOptions', () => {
  it('offers both directions between unrelated tasks', () => {
    const tasks = mapOf(task('a', quest('A')), task('b', quest('B')));
    const options = computeLinkOptions(tasks, 'a')!;
    expect(options.asDependency.get('b')).toBe('ok');
    expect(options.asDependent.get('b')).toBe('ok');
    // The dragged card is never its own drop target.
    expect(options.asDependency.has('a')).toBe(false);
  });

  it('refuses the direction that already exists', () => {
    const tasks = mapOf(task('a', quest('A')), task('b', quest('B'), { explicitDeps: ['a'] }));
    const options = computeLinkOptions(tasks, 'a')!;
    // b already depends on a…
    expect(options.asDependency.get('b')).toBe('linked');
    // …so the other way round would close a two-task loop.
    expect(options.asDependent.get('b')).toBe('cycle');
  });

  it('refuses a link that would loop through a chain', () => {
    const tasks = mapOf(
      task('a', quest('A')),
      task('b', quest('B'), { explicitDeps: ['a'] }),
      task('c', quest('C'), { explicitDeps: ['b'] }),
    );
    const options = computeLinkOptions(tasks, 'a')!;
    expect(options.asDependent.get('c')).toBe('cycle');
    expect(options.asDependency.get('c')).toBe('ok');
  });

  it('counts derived level edges as links, in both directions', () => {
    const tasks = mapOf(task('h30', herb(30)), task('h50', herb(50)));
    const options = computeLinkOptions(tasks, 'h30')!;
    // h50 auto-depends on h30 — nothing to add, and never the reverse.
    expect(options.asDependency.get('h50')).toBe('linked');
    expect(options.asDependent.get('h50')).toBe('cycle');
  });

  it('is null for a card that is no longer on the board', () => {
    expect(computeLinkOptions(mapOf(task('a', quest('A'))), 'gone')).toBeNull();
  });
});
