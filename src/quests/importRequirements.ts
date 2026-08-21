import { getWikitext, listQuestTitles } from '@/api/wiki';
import type { Skill } from '@/domain/skills';
import { useTaskStore } from '@/store/taskStore';
import { normalizeQuestName, parseQuestRequirements } from './questParser';

export interface ImportReport {
  created: number;
  linked: number;
  unparsed: string[];
}

function findLevelTask(skill: Skill, level: number): string | null {
  for (const task of Object.values(useTaskStore.getState().tasks)) {
    if (task.payload.kind === 'level' && task.payload.skill === skill && task.payload.level === level) {
      return task.id;
    }
  }
  return null;
}

function findQuestTask(questName: string): string | null {
  const wanted = normalizeQuestName(questName);
  for (const task of Object.values(useTaskStore.getState().tasks)) {
    if (task.payload.kind === 'quest' && normalizeQuestName(task.payload.questName) === wanted) {
      return task.id;
    }
  }
  return null;
}

/**
 * One-click quest requirements: fetch the quest's wikitext, parse skill and
 * quest requirements, link them as dependencies of the quest task — creating
 * any that don't exist yet (created level tasks slot into the auto level
 * chains for free). Partial parses succeed; leftovers are reported.
 */
export async function importQuestRequirements(taskId: string): Promise<ImportReport> {
  const store = useTaskStore.getState();
  const task = store.tasks[taskId];
  if (!task || task.payload.kind !== 'quest') {
    throw new Error('Requirements can only be imported for quest tasks.');
  }
  const questName = task.payload.questName.trim();
  if (!questName) throw new Error('Enter the quest name first.');

  const [questTitles, pages] = await Promise.all([
    listQuestTitles().catch(() => [] as string[]),
    getWikitext([questName]),
  ]);
  const resolvedTitle = Object.keys(pages)[0];
  const wikitext = resolvedTitle ? pages[resolvedTitle] : undefined;
  if (!wikitext) {
    throw new Error(`Could not find a wiki page for "${questName}".`);
  }

  const known = new Set(questTitles.map(normalizeQuestName));
  const parsed = parseQuestRequirements(wikitext, known, resolvedTitle);

  let created = 0;
  let linked = 0;

  for (const req of parsed.skills) {
    let depId = findLevelTask(req.skill, req.level);
    if (!depId) {
      depId = useTaskStore
        .getState()
        .createTask({ payload: { kind: 'level', skill: req.skill, level: req.level } });
      created++;
    }
    if (useTaskStore.getState().addDep(taskId, depId)) linked++;
  }

  for (const requiredQuest of parsed.quests) {
    let depId = findQuestTask(requiredQuest);
    if (!depId) {
      depId = useTaskStore
        .getState()
        .createTask({ payload: { kind: 'quest', questName: requiredQuest } });
      created++;
    }
    if (useTaskStore.getState().addDep(taskId, depId)) linked++;
  }

  return { created, linked, unparsed: parsed.unparsed };
}
