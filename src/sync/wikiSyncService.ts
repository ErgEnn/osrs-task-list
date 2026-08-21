import { getPlayerState } from '@/api/wikiSync';
import { normalizeSkillName, type Skill } from '@/domain/skills';
import { normalizeQuestName } from '@/quests/questParser';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';

export interface SyncReport {
  /** Titles of tasks promoted to done by this refresh. */
  completedTitles: string[];
}

const QUEST_COMPLETE = 2;

/**
 * Pull the player's WikiSync state and auto-complete matching tasks:
 * quest tasks whose quest is finished, level tasks whose skill level has been
 * reached. Promotion only — a refresh never demotes a task the user finished
 * or reordered manually.
 */
export async function refreshFromWikiSync(): Promise<SyncReport> {
  const username = useSettingsStore.getState().username.trim();
  if (!username) {
    throw new Error('Set your RuneScape username in the settings first.');
  }

  const player = await getPlayerState(username);

  const questStatus = new Map<string, number>();
  for (const [quest, status] of Object.entries(player.quests)) {
    questStatus.set(normalizeQuestName(quest), status);
  }
  const levelOf = new Map<Skill, number>();
  for (const [name, level] of Object.entries(player.levels)) {
    const skill = normalizeSkillName(name);
    if (skill) levelOf.set(skill, level);
  }

  const completedTitles: string[] = [];
  for (const task of Object.values(useTaskStore.getState().tasks)) {
    if (task.status === 'done') continue;
    let finished = false;
    if (task.payload.kind === 'quest') {
      finished = questStatus.get(normalizeQuestName(task.payload.questName)) === QUEST_COMPLETE;
    } else if (task.payload.kind === 'level') {
      const current = levelOf.get(task.payload.skill);
      finished = current !== undefined && current >= task.payload.level;
    }
    if (finished) {
      useTaskStore.getState().setStatus(task.id, 'done');
      completedTitles.push(task.title);
    }
  }

  useSettingsStore.getState().setLastSyncAt(Date.now());
  return { completedTitles };
}
