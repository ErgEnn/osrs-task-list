import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setFetchImpl } from '@/api/http';
import { emptyColumns } from '@/domain/board';
import { useTaskStore } from '@/store/taskStore';
import lunarDiplomacy from './__fixtures__/lunar-diplomacy.wikitext.txt?raw';
import { importQuestRequirements } from './importRequirements';

const QUEST_TITLES = [
  'Lunar Diplomacy',
  'The Fremennik Trials',
  'Lost City',
  'Rune Mysteries',
  'Shilo Village',
];

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: {}, columns: emptyColumns() });
  setFetchImpl(async (input) => {
    const url = String(input);
    let payload: unknown;
    if (url.includes('list=categorymembers')) {
      payload = {
        query: {
          categorymembers: QUEST_TITLES.map((title, i) => ({ pageid: i + 1, ns: 0, title })),
        },
      };
    } else if (url.includes('prop=revisions')) {
      payload = {
        query: {
          pages: [
            {
              title: 'Lunar Diplomacy',
              revisions: [{ slots: { main: { content: lunarDiplomacy } } }],
            },
          ],
        },
      };
    } else {
      throw new Error(`Unexpected request ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200 });
  });
});

afterEach(() => setFetchImpl(null));

describe('importQuestRequirements', () => {
  it('creates missing requirement tasks, reuses existing ones, and wires deps', async () => {
    const store = useTaskStore.getState();
    // Pre-existing: the exact Crafting 61 task and a quest task with odd casing.
    const existingCrafting = store.createTask({
      payload: { kind: 'level', skill: 'Crafting', level: 61 },
    });
    const existingQuest = store.createTask({
      payload: { kind: 'quest', questName: 'lost city' },
    });
    const questTask = store.createTask({
      payload: { kind: 'quest', questName: 'Lunar Diplomacy' },
    });

    const report = await importQuestRequirements(questTask);

    // 7 skills + 4 quests; 2 already existed.
    expect(report.linked).toBe(11);
    expect(report.created).toBe(9);
    expect(report.unparsed).toEqual([]);

    const after = useTaskStore.getState();
    const deps = after.tasks[questTask].explicitDeps;
    expect(deps).toHaveLength(11);
    expect(deps).toContain(existingCrafting);
    expect(deps).toContain(existingQuest);

    // Re-running is idempotent: nothing new created or linked.
    const rerun = await importQuestRequirements(questTask);
    expect(rerun.created).toBe(0);
    expect(rerun.linked).toBe(0);
  });

  it('rejects non-quest tasks and unknown pages', async () => {
    const store = useTaskStore.getState();
    const itemTask = store.createTask({
      payload: { kind: 'item', itemName: 'Coal', quantity: 1 },
    });
    await expect(importQuestRequirements(itemTask)).rejects.toThrow(/quest tasks/);

    setFetchImpl(async (input) => {
      const url = String(input);
      const payload = url.includes('list=categorymembers')
        ? { query: { categorymembers: [] } }
        : { query: { pages: [{ title: 'Nope', missing: true }] } };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const ghostQuest = store.createTask({
      payload: { kind: 'quest', questName: 'Not A Real Quest' },
    });
    await expect(importQuestRequirements(ghostQuest)).rejects.toThrow(/wiki page/);
  });
});
