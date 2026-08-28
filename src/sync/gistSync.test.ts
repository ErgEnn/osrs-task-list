import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GIST_FILENAME } from '@/api/gist';
import { setFetchImpl } from '@/api/http';
import type { Task } from '@/domain/types';
import { useSettingsStore } from '@/store/settingsStore';
import { emptyColumns } from '@/domain/board';
import { useTaskStore } from '@/store/taskStore';
import { BUNDLE_VERSION, type SyncBundle } from './bundle';
import { syncWithGist } from './gistSync';

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

function remoteBundle(tasks: Task[], deleted: Record<string, number> = {}): SyncBundle {
  const columns = emptyColumns();
  for (const t of tasks) columns[t.status].push(t.id);
  return {
    v: BUNDLE_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    columns,
    deleted,
  };
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** Stand-in gist API: one stored file, plus a log of what the client did. */
function fakeGist(initial: string | null, status = 200) {
  const calls: Call[] = [];
  let stored = initial;
  setFetchImpl(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (status !== 200) {
      return new Response('nope', { status });
    }
    if (method !== 'GET') {
      stored = (body as { files: Record<string, { content: string }> }).files[GIST_FILENAME]
        .content;
    }
    return Response.json({
      id: 'gist-1',
      html_url: 'https://gist.github.com/u/gist-1',
      updated_at: '2026-01-01T00:00:00.000Z',
      files: stored === null ? {} : { [GIST_FILENAME]: { content: stored } },
    });
  });
  return {
    calls,
    get stored() {
      return stored === null ? null : (JSON.parse(stored) as SyncBundle);
    },
  };
}

beforeEach(() => {
  useTaskStore.setState({ tasks: {}, columns: emptyColumns(), deleted: {} });
  useSettingsStore.setState({ gistToken: 'token-abc', gistId: '', gistUrl: '' });
});

afterEach(() => setFetchImpl(null));

describe('syncWithGist', () => {
  it('refuses to run without a token', async () => {
    useSettingsStore.setState({ gistToken: '  ' });
    await expect(syncWithGist()).rejects.toThrow(/gist" scope/);
  });

  it('creates a private gist on the first sync and remembers its id', async () => {
    useTaskStore.setState({ tasks: { a: task('a') }, columns: { ...emptyColumns(), todo: ['a'] } });
    const server = fakeGist(null);

    const report = await syncWithGist();

    expect(report.created).toBe(true);
    expect(server.calls[0].method).toBe('POST');
    expect((server.calls[0].body as { public: boolean }).public).toBe(false);
    expect(server.stored?.tasks.a).toBeDefined();
    expect(useSettingsStore.getState().gistId).toBe('gist-1');
    expect(useSettingsStore.getState().gistLastSyncAt).not.toBeNull();
  });

  it('sends the token as a bearer credential and nothing else', async () => {
    const server = fakeGist(null);
    await syncWithGist();
    expect(server.calls[0].url).toBe('https://api.github.com/gists');
    expect(server.calls).toHaveLength(1);
  });

  it('merges the remote tasks in and pushes the union back', async () => {
    useSettingsStore.setState({ gistId: 'gist-1' });
    useTaskStore.setState({
      tasks: { local: task('local') },
      columns: { ...emptyColumns(), todo: ['local'] },
    });
    const server = fakeGist(JSON.stringify(remoteBundle([task('remote')])));

    const report = await syncWithGist();

    expect(report.added).toEqual(['remote']);
    expect(report.pushed).toBe(true);
    expect(Object.keys(useTaskStore.getState().tasks).sort()).toEqual(['local', 'remote']);
    expect(Object.keys(server.stored!.tasks).sort()).toEqual(['local', 'remote']);
    expect(server.calls.map((c) => c.method)).toEqual(['GET', 'PATCH']);
  });

  it('does not push when the gist already matches this device', async () => {
    useSettingsStore.setState({ gistId: 'gist-1' });
    const shared = task('same');
    useTaskStore.setState({
      tasks: { same: shared },
      columns: { ...emptyColumns(), todo: ['same'] },
    });
    const server = fakeGist(JSON.stringify(remoteBundle([shared])));

    const report = await syncWithGist();

    expect(report.pushed).toBe(false);
    expect(report.added).toEqual([]);
    expect(server.calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('pushes a local delete even though nothing came back to merge', async () => {
    useSettingsStore.setState({ gistId: 'gist-1' });
    const deletedAt = Date.now();
    useTaskStore.setState({ tasks: {}, columns: emptyColumns(), deleted: { dropped: deletedAt } });
    const server = fakeGist(
      JSON.stringify(remoteBundle([task('dropped', { updatedAt: deletedAt - 60_000 })])),
    );

    const report = await syncWithGist();

    expect(report.pushed).toBe(true);
    expect(server.stored!.tasks.dropped).toBeUndefined();
    expect(server.stored!.deleted.dropped).toBe(deletedAt);
  });

  it('applies a remote delete locally', async () => {
    useSettingsStore.setState({ gistId: 'gist-1' });
    useTaskStore.setState({
      tasks: { doomed: task('doomed') },
      columns: { ...emptyColumns(), todo: ['doomed'] },
    });
    fakeGist(JSON.stringify(remoteBundle([], { doomed: Date.now() })));

    const report = await syncWithGist();

    expect(report.removed).toEqual(['doomed']);
    expect(useTaskStore.getState().tasks.doomed).toBeUndefined();
    expect(useTaskStore.getState().columns.todo).toEqual([]);
  });

  it('surfaces a rejected token instead of wiping anything', async () => {
    useSettingsStore.setState({ gistId: 'gist-1' });
    useTaskStore.setState({ tasks: { a: task('a') }, columns: { ...emptyColumns(), todo: ['a'] } });
    fakeGist(null, 401);

    await expect(syncWithGist()).rejects.toMatchObject({ status: 401 });
    expect(useTaskStore.getState().tasks.a).toBeDefined();
  });
});
