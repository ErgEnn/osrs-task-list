// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GIST_FILENAME } from '@/api/gist';
import { setFetchImpl } from '@/api/http';
import { emptyColumns } from '@/domain/board';
import type { Task } from '@/domain/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';
import { PUSH_DEBOUNCE_MS, startGistAutoSync } from './gistAutoSync';

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

function remoteBundle(tasks: Task[]): SyncBundle {
  const columns = emptyColumns();
  for (const t of tasks) columns[t.status].push(t.id);
  return {
    v: BUNDLE_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    columns,
    deleted: {},
  };
}

/** Stand-in gist API: one stored file plus a log of what the client did. */
function fakeGist(initial: string | null) {
  const methods: string[] = [];
  let stored = initial;
  setFetchImpl(async (_input, init) => {
    const method = init?.method ?? 'GET';
    methods.push(method);
    if (method !== 'GET') {
      const body = JSON.parse(String(init?.body)) as {
        files: Record<string, { content: string }>;
      };
      stored = body.files[GIST_FILENAME].content;
    }
    return Response.json({
      id: 'gist-1',
      html_url: 'https://gist.github.com/u/gist-1',
      updated_at: '2026-01-01T00:00:00.000Z',
      files: stored === null ? {} : { [GIST_FILENAME]: { content: stored } },
    });
  });
  return {
    methods,
    get stored() {
      return stored === null ? null : (JSON.parse(stored) as SyncBundle);
    },
    set stored(bundle: SyncBundle | null) {
      stored = bundle === null ? null : JSON.stringify(bundle);
    },
  };
}

/**
 * Drain the sync's promise chain. Reading a `Response` body is a real task and
 * not merely a microtask, so awaiting `Promise.resolve()` is not enough — the
 * async timer advance yields to the event loop between ticks.
 */
async function settle() {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  setVisibility('visible');
  useTaskStore.setState({ tasks: {}, columns: emptyColumns(), deleted: {} });
  useSettingsStore.setState({ gistToken: 'token', gistId: 'gist-1', gistUrl: '' });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  setFetchImpl(null);
  vi.useRealTimers();
});

describe('startGistAutoSync', () => {
  it('syncs once on start', async () => {
    const server = fakeGist(JSON.stringify(remoteBundle([task('remote')])));
    stop = startGistAutoSync(5);
    await settle();
    expect(useTaskStore.getState().tasks.remote).toBeDefined();
    expect(server.methods).toContain('GET');
  });

  it('pushes a completion without waiting for the interval', async () => {
    useTaskStore.setState({
      tasks: { t: task('t') },
      columns: { ...emptyColumns(), todo: ['t'] },
    });
    const server = fakeGist(JSON.stringify(remoteBundle([task('t')])));
    stop = startGistAutoSync(60);
    await settle();
    expect(server.stored!.tasks.t.status).toBe('todo');

    useTaskStore.getState().updateTask('t', { status: 'done' });
    // Nothing yet — the push is debounced, not fired per keystroke.
    await settle();
    expect(server.stored!.tasks.t.status).toBe('todo');

    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    await settle();
    expect(server.stored!.tasks.t.status).toBe('done');
  });

  it('coalesces a burst of edits into one push', async () => {
    useTaskStore.setState({
      tasks: { a: task('a'), b: task('b') },
      columns: { ...emptyColumns(), todo: ['a', 'b'] },
    });
    const server = fakeGist(JSON.stringify(remoteBundle([task('a'), task('b')])));
    stop = startGistAutoSync(60);
    await settle();
    const before = server.methods.length;

    useTaskStore.getState().updateTask('a', { status: 'done' });
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS / 2);
    useTaskStore.getState().updateTask('b', { status: 'done' });
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    await settle();

    expect(server.methods.slice(before)).toEqual(['GET', 'PATCH']);
    expect(server.stored!.tasks.a.status).toBe('done');
    expect(server.stored!.tasks.b.status).toBe('done');
  });

  it('flushes a pending push when the tab is hidden', async () => {
    useTaskStore.setState({ tasks: { t: task('t') }, columns: { ...emptyColumns(), todo: ['t'] } });
    const server = fakeGist(JSON.stringify(remoteBundle([task('t')])));
    stop = startGistAutoSync(60);
    await settle();

    useTaskStore.getState().updateTask('t', { status: 'done' });
    setVisibility('hidden');
    await settle();

    expect(server.stored!.tasks.t.status).toBe('done');
  });

  it('pulls again when the tab becomes visible', async () => {
    const server = fakeGist(JSON.stringify(remoteBundle([])));
    stop = startGistAutoSync(60);
    await settle();

    setVisibility('hidden');
    await settle();
    // The other device completes something while this tab is in the background.
    server.stored = remoteBundle([task('elsewhere', { status: 'done', updatedAt: 2 })]);

    setVisibility('visible');
    await settle();
    expect(useTaskStore.getState().tasks.elsewhere?.status).toBe('done');
  });

  it('does not push the store rewrite its own merge performs', async () => {
    const server = fakeGist(JSON.stringify(remoteBundle([task('remote')])));
    stop = startGistAutoSync(60);
    await settle();
    const after = server.methods.length;

    // The merge replaced the store wholesale; that must not read as a local
    // edit, or every sync would schedule the next one for ever.
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 3);
    await settle();
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 3);
    await settle();

    // At most one settling round (the merge left the gist owing a push), and
    // certainly not a round every two seconds.
    expect(server.methods.length - after).toBeLessThanOrEqual(2);
  });

  it('stops touching the network once stopped', async () => {
    useTaskStore.setState({ tasks: { t: task('t') }, columns: { ...emptyColumns(), todo: ['t'] } });
    const server = fakeGist(JSON.stringify(remoteBundle([task('t')])));
    stop = startGistAutoSync(5);
    await settle();
    const after = server.methods.length;

    stop();
    stop = undefined;
    useTaskStore.getState().updateTask('t', { status: 'done' });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settle();

    expect(server.methods.length).toBe(after);
  });
});
