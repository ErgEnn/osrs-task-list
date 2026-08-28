import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import playerFixture from '@/api/__fixtures__/wikisync-player.json';
import { setFetchImpl } from '@/api/http';
import { emptyColumns } from '@/domain/board';
import { useTaskStore } from '@/store/taskStore';
import { useSettingsStore } from '@/store/settingsStore';
import { refreshFromWikiSync } from './wikiSyncService';

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: {}, columns: emptyColumns() });
  useSettingsStore.setState({ username: 'example player', lastSyncAt: null });
  setFetchImpl(async () => new Response(JSON.stringify(playerFixture), { status: 200 }));
});

afterEach(() => setFetchImpl(null));

describe('refreshFromWikiSync', () => {
  it('promotes finished quests and reached levels, never demotes', async () => {
    const store = useTaskStore.getState();
    // Fixture: Cook's Assistant = 2 (complete), Dragon Slayer I = 1, Herblore 52, Attack 70.
    const cooks = store.createTask({ payload: { kind: 'quest', questName: 'cook’s assistant' } });
    const dragon = store.createTask({ payload: { kind: 'quest', questName: 'Dragon Slayer I' } });
    const herb50 = store.createTask({ payload: { kind: 'level', skill: 'Herblore', level: 50 } });
    const herb60 = store.createTask({ payload: { kind: 'level', skill: 'Herblore', level: 60 } });
    const kill = store.createTask({ payload: { kind: 'kill', monsterName: 'Zulrah' } });
    // Manually completed task for a quest WikiSync says is only in progress:
    store.setStatus(dragon, 'done');

    const report = await refreshFromWikiSync();

    const after = useTaskStore.getState().tasks;
    expect(after[cooks].status).toBe('done'); // quest complete (matched despite ’)
    expect(after[herb50].status).toBe('done'); // 52 >= 50
    expect(after[herb60].status).toBe('todo'); // 52 < 60
    expect(after[kill].status).toBe('todo'); // kill tasks unaffected
    expect(after[dragon].status).toBe('done'); // stays done (promotion only)
    expect(report.completedTitles.sort()).toEqual(['cook’s assistant', 'Herblore 50'].sort());
    expect(useSettingsStore.getState().lastSyncAt).not.toBeNull();
  });

  it('requires a username', async () => {
    useSettingsStore.setState({ username: '  ' });
    await expect(refreshFromWikiSync()).rejects.toThrow(/username/);
  });
});
