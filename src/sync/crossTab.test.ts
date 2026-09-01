// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyColumns } from '@/domain/board';
import type { Status, Task } from '@/domain/types';
import {
  SETTINGS_PERSIST_VERSION,
  SETTINGS_STORAGE_KEY,
  useSettingsStore,
} from '@/store/settingsStore';
import { TASKS_PERSIST_VERSION, TASKS_STORAGE_KEY, useTaskStore } from '@/store/taskStore';
import { adoptSettings, adoptTasks, startCrossTabSync } from './crossTab';

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

/** What another tab's zustand persist would have left in `localStorage`. */
function otherTabWrote(tasks: Task[], deleted: Record<string, number> = {}): string {
  const columns = emptyColumns();
  for (const t of tasks) columns[t.status].push(t.id);
  return JSON.stringify({
    state: {
      tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
      columns,
      deleted,
    },
    version: TASKS_PERSIST_VERSION,
  });
}

function otherTabWroteSettings(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: SETTINGS_PERSIST_VERSION });
}

function seed(tasks: Task[]) {
  const columns = emptyColumns();
  for (const t of tasks) columns[t.status].push(t.id);
  useTaskStore.setState({
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    columns,
    deleted: {},
  });
}

const titles = (status: Status) =>
  useTaskStore.getState().columns[status].map((id) => useTaskStore.getState().tasks[id].title);

let stop: (() => void) | undefined;

beforeEach(() => {
  useTaskStore.setState({ tasks: {}, columns: emptyColumns(), deleted: {} });
  useSettingsStore.setState({
    username: '',
    gistToken: '',
    gistId: '',
    gistSyncMinutes: 0,
    view: 'graph',
  });
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
});

describe('adoptTasks', () => {
  it('takes on a task another tab added', () => {
    seed([task('mine')]);

    expect(adoptTasks(otherTabWrote([task('mine'), task('theirs')]))).toBe(true);

    expect(Object.keys(useTaskStore.getState().tasks).sort()).toEqual(['mine', 'theirs']);
  });

  it('does not let a stale write from another tab undo a local edit', () => {
    // Both tabs loaded the same task; this one has since completed it.
    seed([task('t', { status: 'done', updatedAt: 200 })]);

    // The other tab, still holding its older copy, writes it back.
    adoptTasks(otherTabWrote([task('t', { status: 'todo', updatedAt: 100 })]));

    expect(useTaskStore.getState().tasks.t.status).toBe('done');
    expect(titles('done')).toEqual(['t']);
  });

  it('keeps both tabs’ edits when each changed a different task', () => {
    seed([task('a', { status: 'done', updatedAt: 200 }), task('b', { updatedAt: 1 })]);

    adoptTasks(
      otherTabWrote([
        task('a', { updatedAt: 1 }),
        task('b', { title: 'renamed there', updatedAt: 300 }),
      ]),
    );

    const { tasks } = useTaskStore.getState();
    expect(tasks.a.status).toBe('done');
    expect(tasks.b.title).toBe('renamed there');
  });

  it('applies a delete made in another tab', () => {
    seed([task('gone'), task('kept')]);
    const deletedAt = Date.now();

    adoptTasks(otherTabWrote([task('kept')], { gone: deletedAt }));

    expect(useTaskStore.getState().tasks.gone).toBeUndefined();
    // The tombstone travels too, so a third tab that still has the task hears
    // about the delete rather than pushing it back at everyone.
    expect(useTaskStore.getState().deleted.gone).toBe(deletedAt);
  });

  it('does not resurrect a task this tab deleted', () => {
    seed([task('gone')]);
    useTaskStore.getState().deleteTask('gone');

    // The other tab has not heard about the delete yet and writes its copy.
    adoptTasks(otherTabWrote([task('gone')]));

    expect(useTaskStore.getState().tasks.gone).toBeUndefined();
  });

  it('settles instead of bouncing state between two tabs', () => {
    seed([task('mine', { updatedAt: 200 })]);
    const incoming = otherTabWrote([task('theirs', { updatedAt: 300 })]);

    // First hearing changes this tab; hearing the same thing again does not,
    // so no write goes back out and the other tab has nothing to answer.
    expect(adoptTasks(incoming)).toBe(true);
    expect(adoptTasks(incoming)).toBe(false);

    // Nor does this tab's own state coming back as another tab's echo.
    const { tasks, columns, deleted } = useTaskStore.getState();
    expect(adoptTasks(JSON.stringify({ state: { tasks, columns, deleted }, version: 2 }))).toBe(
      false,
    );
  });

  it('ignores writes it cannot read: junk, another key’s shape, another version', () => {
    seed([task('mine')]);

    expect(adoptTasks(null)).toBe(false);
    expect(adoptTasks('not json at all')).toBe(false);
    expect(adoptTasks(JSON.stringify({ state: { tasks: {} }, version: 1 }))).toBe(false);
    expect(adoptTasks(JSON.stringify({ nothing: true }))).toBe(false);

    expect(Object.keys(useTaskStore.getState().tasks)).toEqual(['mine']);
  });

  it('drops entries in another tab’s write that are not tasks', () => {
    seed([]);

    adoptTasks(
      JSON.stringify({
        state: { tasks: { real: task('real'), junk: { id: 'junk' } }, columns: emptyColumns() },
        version: TASKS_PERSIST_VERSION,
      }),
    );

    expect(Object.keys(useTaskStore.getState().tasks)).toEqual(['real']);
  });
});

describe('adoptSettings', () => {
  it('picks up a token pasted in another tab', () => {
    expect(adoptSettings(otherTabWroteSettings({ gistToken: 'ghp_x', gistId: 'g1' }))).toBe(true);

    expect(useSettingsStore.getState().gistToken).toBe('ghp_x');
    expect(useSettingsStore.getState().gistId).toBe('g1');
  });

  it('leaves this tab’s view alone', () => {
    useSettingsStore.setState({ view: 'board' });

    adoptSettings(otherTabWroteSettings({ view: 'graph', username: 'Zezima' }));

    expect(useSettingsStore.getState().view).toBe('board');
    expect(useSettingsStore.getState().username).toBe('Zezima');
  });

  it('adopts a field only when the write carries it', () => {
    useSettingsStore.setState({ gistToken: 'ghp_x', username: 'Zezima' });

    // The other tab wrote a partial state; the token must survive it.
    adoptSettings(otherTabWroteSettings({ username: 'Woox' }));

    expect(useSettingsStore.getState().gistToken).toBe('ghp_x');
    expect(useSettingsStore.getState().username).toBe('Woox');
  });

  it('reports no change when the write matches this tab', () => {
    useSettingsStore.setState({ username: 'Zezima' });
    expect(adoptSettings(otherTabWroteSettings({ username: 'Zezima' }))).toBe(false);
  });

  it('ignores a field whose type does not match', () => {
    useSettingsStore.setState({ username: 'Zezima' });
    adoptSettings(otherTabWroteSettings({ username: 42, lastSyncAt: 7 }));

    expect(useSettingsStore.getState().username).toBe('Zezima');
    // …while a field that is legitimately null until first set still lands.
    expect(useSettingsStore.getState().lastSyncAt).toBe(7);
  });
});

describe('startCrossTabSync', () => {
  function fireStorage(key: string, newValue: string | null) {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
  }

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('merges on a storage event from another tab', () => {
    seed([task('mine')]);
    stop = startCrossTabSync();

    fireStorage(TASKS_STORAGE_KEY, otherTabWrote([task('theirs')]));
    expect(useTaskStore.getState().tasks.theirs).toBeDefined();

    fireStorage(SETTINGS_STORAGE_KEY, otherTabWroteSettings({ username: 'Zezima' }));
    expect(useSettingsStore.getState().username).toBe('Zezima');
  });

  it('ignores other keys', () => {
    seed([task('mine')]);
    stop = startCrossTabSync();

    fireStorage('osrs-tl:icon-cache:v1', otherTabWrote([task('theirs')]));

    expect(useTaskStore.getState().tasks.theirs).toBeUndefined();
  });

  it('catches up on becoming visible, for events a hidden tab never got', () => {
    seed([task('mine')]);
    stop = startCrossTabSync();
    setVisibility('hidden');

    localStorage.setItem(TASKS_STORAGE_KEY, otherTabWrote([task('theirs')]));
    localStorage.setItem(SETTINGS_STORAGE_KEY, otherTabWroteSettings({ username: 'Zezima' }));

    setVisibility('visible');

    expect(useTaskStore.getState().tasks.theirs).toBeDefined();
    expect(useSettingsStore.getState().username).toBe('Zezima');
  });

  it('stops listening once stopped', () => {
    seed([task('mine')]);
    stop = startCrossTabSync();
    stop();
    stop = undefined;

    fireStorage(TASKS_STORAGE_KEY, otherTabWrote([task('theirs')]));

    expect(useTaskStore.getState().tasks.theirs).toBeUndefined();
  });
});
