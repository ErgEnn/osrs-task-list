import { beforeEach, describe, expect, it } from 'vitest';
import type { Status, Task, TaskMap, TaskPayload } from '@/domain/types';
import { emptyColumns, useTaskStore } from './taskStore';

function reset() {
  useTaskStore.setState({ tasks: {}, columns: emptyColumns() });
}

function seed(id: string, payload: TaskPayload, status: Status = 'todo', deps: string[] = []) {
  const task: Task = {
    id,
    title: id,
    description: '',
    status,
    iconRef: { kind: 'none' },
    payload,
    explicitDeps: deps,
    createdAt: Object.keys(useTaskStore.getState().tasks).length + 1,
  };
  useTaskStore.setState((state) => ({
    tasks: { ...state.tasks, [id]: task },
    columns: { ...state.columns, [status]: [...state.columns[status], id] },
  }));
}

const quest = (name: string) => ({ kind: 'quest', questName: name }) as const;
const herb = (level: number) => ({ kind: 'level', skill: 'Herblore', level }) as const;

beforeEach(reset);

describe('createTask', () => {
  it('fills defaults and appends to the status column', () => {
    const id = useTaskStore.getState().createTask({ payload: herb(50) });
    const state = useTaskStore.getState();
    expect(state.tasks[id].title).toBe('Herblore 50');
    expect(state.tasks[id].iconRef).toEqual({ kind: 'builtin', id: 'skill:herblore' });
    expect(state.tasks[id].status).toBe('todo');
    expect(state.columns.todo).toEqual([id]);
  });
});

describe('status and ordering', () => {
  it('setStatus appends to the end of the target column', () => {
    seed('a', quest('A'));
    seed('b', quest('B'), 'done');
    useTaskStore.getState().setStatus('a', 'done');
    const state = useTaskStore.getState();
    expect(state.columns.todo).toEqual([]);
    expect(state.columns.done).toEqual(['b', 'a']);
    expect(state.tasks.a.status).toBe('done');
  });

  it('moveTask reorders within a column', () => {
    seed('a', quest('A'));
    seed('b', quest('B'));
    seed('c', quest('C'));
    useTaskStore.getState().moveTask('a', 'todo', 2);
    expect(useTaskStore.getState().columns.todo).toEqual(['b', 'c', 'a']);
  });

  it('moveTask inserts at an index in another column and clamps', () => {
    seed('a', quest('A'));
    seed('b', quest('B'), 'inprogress');
    useTaskStore.getState().moveTask('a', 'inprogress', 0);
    expect(useTaskStore.getState().columns.inprogress).toEqual(['a', 'b']);
    useTaskStore.getState().moveTask('b', 'todo', 99);
    expect(useTaskStore.getState().columns.todo).toEqual(['b']);
  });
});

describe('dependencies', () => {
  it('addDep rejects self, duplicates, missing tasks, and cycles', () => {
    seed('a', quest('A'), 'todo', ['b']);
    seed('b', quest('B'));
    const { addDep } = useTaskStore.getState();
    expect(addDep('a', 'a')).toBe(false);
    expect(addDep('a', 'b')).toBe(false); // duplicate
    expect(addDep('a', 'nope')).toBe(false);
    expect(addDep('b', 'a')).toBe(false); // cycle
    seed('c', quest('C'));
    expect(addDep('c', 'a')).toBe(true);
    expect(useTaskStore.getState().tasks.c.explicitDeps).toEqual(['a']);
  });

  it('deleteTask strips the id from columns and from other tasks deps', () => {
    seed('a', quest('A'));
    seed('b', quest('B'), 'todo', ['a']);
    useTaskStore.getState().deleteTask('a');
    const state = useTaskStore.getState();
    expect(state.tasks.a).toBeUndefined();
    expect(state.columns.todo).toEqual(['b']);
    expect(state.tasks.b.explicitDeps).toEqual([]);
  });

  it('updateTask breaks cycles created through auto level edges', () => {
    seed('a', herb(50), 'todo', ['b']);
    seed('b', { kind: 'level', skill: 'Cooking', level: 40 });
    useTaskStore.getState().updateTask('b', { payload: herb(60) });
    expect(useTaskStore.getState().tasks.a.explicitDeps).toEqual([]);
  });
});

describe('reconcile / replaceAll', () => {
  it('repairs mismatched columns, unknown ids, and dangling deps', () => {
    const tasks: TaskMap = {
      a: {
        id: 'a',
        title: 'A',
        description: '',
        status: 'done',
        iconRef: { kind: 'none' },
        payload: quest('A'),
        explicitDeps: ['ghost', 'a'],
        createdAt: 1,
      },
      b: {
        id: 'b',
        title: 'B',
        description: '',
        status: 'todo',
        iconRef: { kind: 'none' },
        payload: quest('B'),
        explicitDeps: [],
        createdAt: 2,
      },
    };
    useTaskStore.setState({
      tasks,
      columns: { todo: ['a', 'zombie'], inprogress: [], done: [] }, // a sits in the wrong column, b is missing
    });
    useTaskStore.getState().reconcile();
    const state = useTaskStore.getState();
    expect(state.columns.todo).toEqual(['b']);
    expect(state.columns.done).toEqual(['a']);
    expect(state.tasks.a.explicitDeps).toEqual([]);
  });

  it('replaceAll reconciles the imported bundle', () => {
    seed('old', quest('Old'));
    useTaskStore.getState().replaceAll({
      tasks: {
        n: {
          id: 'n',
          title: 'N',
          description: '',
          status: 'inprogress',
          iconRef: { kind: 'none' },
          payload: quest('N'),
          explicitDeps: [],
          createdAt: 5,
        },
      },
      columns: emptyColumns(),
    });
    const state = useTaskStore.getState();
    expect(state.tasks.old).toBeUndefined();
    expect(state.columns.inprogress).toEqual(['n']);
  });
});
